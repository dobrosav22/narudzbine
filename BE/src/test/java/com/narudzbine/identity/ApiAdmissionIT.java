package com.narudzbine.identity;

import static org.assertj.core.api.Assertions.*;

import com.narudzbine.identity.api.LoginThrottled;
import com.narudzbine.identity.application.LoginThrottle;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.*;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class ApiAdmissionIT {
    @Container static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336")
            .asCompatibleSubstituteFor("postgres")).withCommand("postgres", "-c", "fsync=on",
                    "-c", "synchronous_commit=on", "-c", "full_page_writes=on");
    private static JdbcTemplate owner;
    private static HikariDataSource pool;
    private final AtomicInteger committed = new AtomicInteger();
    private final TestClock clock = new TestClock();
    private final byte[] key = new byte[32];
    private JdbcTemplate runtime;
    private TransactionTemplate transaction;
    private LoginThrottle throttle;

    @BeforeAll static void database() {
        MigrationCommand.migrate(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        owner = new JdbcTemplate(new DriverManagerDataSource(DATABASE.getJdbcUrl(),
                DATABASE.getUsername(), DATABASE.getPassword()));
        String password = UUID.randomUUID().toString();
        owner.execute("CREATE ROLE api_admission_runtime LOGIN PASSWORD '" + password + "'");
        owner.execute("GRANT USAGE ON SCHEMA public TO api_admission_runtime");
        owner.execute("GRANT SELECT,INSERT,UPDATE ON login_throttle_bucket,login_attempt TO api_admission_runtime");
        var config = new HikariConfig();
        config.setJdbcUrl(DATABASE.getJdbcUrl());
        config.setUsername("api_admission_runtime");
        config.setPassword(password);
        config.setMaximumPoolSize(16);
        config.setMinimumIdle(1);
        config.setConnectionInitSql("SET lock_timeout='2s'; SET statement_timeout='10s'");
        pool = new HikariDataSource(config);
    }

    @AfterAll static void closePool() { if (pool != null) pool.close(); }

    @BeforeEach void services() {
        new java.security.SecureRandom().nextBytes(key);
        var counted = new DelegatingDataSource(pool) {
            @Override public Connection getConnection() throws java.sql.SQLException {
                Connection connection = super.getConnection();
                return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(),
                        new Class<?>[]{Connection.class}, (proxy, method, args) -> {
                            try {
                                Object result = method.invoke(connection, args);
                                if (method.getName().equals("commit")) committed.incrementAndGet();
                                return result;
                            } catch (InvocationTargetException failure) { throw failure.getCause(); }
                        });
            }
        };
        runtime = new JdbcTemplate(counted);
        var manager = new DataSourceTransactionManager(counted);
        transaction = new TransactionTemplate(manager);
        throttle = new LoginThrottle(runtime, clock, new UuidGenerator(clock), key);
    }

    @Test void oneCommitPrecedesIndependentWorkAndNestedAdmissionIsRejected() {
        UUID actor = UUID.randomUUID();
        throttle.admitApi(actor, true);
        assertThat(committed).hasValue(1);
        assertThat(attempts(actor, false)).isEqualTo(1);
        assertThat(attempts(actor, true)).isEqualTo(1);
        transaction.executeWithoutResult(status -> {
            runtime.update("UPDATE login_attempt SET failed=true WHERE source_key=?", source(actor, true));
            status.setRollbackOnly();
        });
        assertThat(owner.queryForObject("SELECT bool_or(failed) FROM login_attempt WHERE source_key=?",
                Boolean.class, source(actor, true))).isFalse();
        assertThat(attempts(actor, false)).isEqualTo(1);
        assertThat(attempts(actor, true)).isEqualTo(1);
        assertThat(committed).hasValue(1);
        UUID other = UUID.randomUUID();
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> throttle.admitApi(other, true)))
                .isInstanceOf(IllegalStateException.class);
        assertThat(attempts(other, false)).isZero();
        assertThat(attempts(other, true)).isZero();
    }

    @Test void exhaustedWriteAllowanceStillConsumesGeneralAllowance() {
        UUID actor = UUID.randomUUID();
        for (int n = 0; n < 60; n++) throttle.admitApi(actor, true);
        assertThatThrownBy(() -> throttle.admitApi(actor, true)).isInstanceOfSatisfying(
                LoginThrottled.class, error -> assertThat(error.retryAfterSeconds()).isEqualTo(60));
        assertThat(attempts(actor, false)).isEqualTo(61);
        assertThat(attempts(actor, true)).isEqualTo(60);
        assertThat(committed).hasValue(61);
        for (int n = 0; n < 59; n++) throttle.admitApi(actor, false);
        assertThatThrownBy(() -> throttle.admitApi(actor, false)).isInstanceOf(LoginThrottled.class);
        assertThat(attempts(actor, false)).isEqualTo(120);
        assertThat(attempts(actor, true)).isEqualTo(60);
    }

    @Test void exhaustedGeneralAllowanceStopsWriteAndExactWindowReopens() {
        UUID actor = UUID.randomUUID();
        for (int n = 0; n < 120; n++) throttle.admitApi(actor, false);
        assertThatThrownBy(() -> throttle.admitApi(actor, true)).isInstanceOf(LoginThrottled.class);
        assertThat(attempts(actor, true)).isZero();
        clock.advance(Duration.ofMillis(59_999));
        assertThatThrownBy(() -> throttle.admitApi(actor, true)).isInstanceOfSatisfying(
                LoginThrottled.class, error -> assertThat(error.retryAfterSeconds()).isEqualTo(1));
        clock.advance(Duration.ofMillis(1));
        throttle.admitApi(actor, true);
        assertThat(attempts(actor, false)).isEqualTo(121);
        assertThat(attempts(actor, true)).isEqualTo(1);
    }

    @Test @Timeout(120) void concurrentWritesHaveExactlySixtyWinners() throws Exception {
        UUID actor = UUID.randomUUID();
        assertThat(compete(actor, Collections.nCopies(80, true))).isEqualTo(60);
        assertThat(attempts(actor, false)).isEqualTo(80);
        assertThat(attempts(actor, true)).isEqualTo(60);
        assertThat(committed).hasValue(80);
    }

    @Test @Timeout(120) void competingReadsAndWritesShareTheGeneralAllowance() throws Exception {
        UUID actor = UUID.randomUUID();
        for (int n = 0; n < 80; n++) throttle.admitApi(actor, false);
        var modes = new ArrayList<Boolean>();
        for (int n = 0; n < 40; n++) { modes.add(true); modes.add(false); }
        assertThat(compete(actor, modes)).isEqualTo(40);
        assertThat(attempts(actor, false)).isEqualTo(120);
        assertThat(attempts(actor, true)).isBetween(0, 40);
    }

    @Test void writeSqlFailurePreservesGeneralAdmissionBeforePropagating() {
        UUID actor = UUID.randomUUID();
        String name = "admission_fault_" + UUID.randomUUID().toString().replace("-", "");
        String hex = HexFormat.of().formatHex(source(actor, true));
        owner.execute("CREATE FUNCTION " + name + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
                + "IF NEW.source_key=decode('" + hex + "','hex') THEN RAISE EXCEPTION 'Synthetic admission fault' "
                + "USING ERRCODE='22000'; END IF; RETURN NEW; END $$");
        owner.execute("CREATE TRIGGER " + name + " BEFORE INSERT ON login_attempt FOR EACH ROW EXECUTE FUNCTION " + name + "()");
        var businessCalls = new AtomicInteger();
        try {
            assertThatThrownBy(() -> { throttle.admitApi(actor, true); businessCalls.incrementAndGet(); })
                    .isInstanceOf(DataAccessException.class);
            assertThat(businessCalls).hasValue(0);
            assertThat(attempts(actor, false)).isEqualTo(1);
            assertThat(attempts(actor, true)).isZero();
            assertThat(committed).hasValue(1);
        } finally {
            owner.execute("DROP TRIGGER " + name + " ON login_attempt");
            owner.execute("DROP FUNCTION " + name + "()");
        }
        throttle.admitApi(actor, true); // A separate later action, never an automatic retry.
        assertThat(attempts(actor, false)).isEqualTo(2);
        assertThat(attempts(actor, true)).isEqualTo(1);
    }

    @Test @Timeout(30) void compoundAdmissionCannotInvertAnExistingCounterLockOrder() throws Exception {
        UUID candidate;
        byte[] lower;
        byte[] higher;
        List<byte[]> keys;
        do {
            candidate = UUID.randomUUID();
            var general = new ArrayList<>(List.of(counterKey("email", "api/" + candidate), source(candidate, false)));
            var write = new ArrayList<>(List.of(counterKey("email", "api-write/" + candidate), source(candidate, true)));
            general.sort(Arrays::compareUnsigned);
            write.sort(Arrays::compareUnsigned);
            lower = write.getFirst();
            higher = general.getLast();
            keys = new ArrayList<>(general);
            keys.addAll(write);
            if (Arrays.compareUnsigned(lower, general.getFirst()) < 0) break;
        } while (true);
        final UUID actor = candidate;
        for (byte[] keyHash : keys) owner.update(
                "INSERT INTO login_throttle_bucket(key_hash) VALUES(?) ON CONFLICT DO NOTHING", keyHash);
        // The competing transaction uses legitimate ascending locks: lower, then higher.
        try (var worker = Executors.newSingleThreadExecutor(); var held = owner.getDataSource().getConnection()) {
            held.setAutoCommit(false);
            try (var statement = held.prepareStatement("SELECT key_hash FROM login_throttle_bucket WHERE key_hash=? FOR UPDATE")) {
                statement.setBytes(1, lower);
                statement.executeQuery().close();
            }
            int blocker;
            try (var statement = held.createStatement(); var row = statement.executeQuery("SELECT pg_backend_pid()")) {
                row.next(); blocker = row.getInt(1);
            }
            var attempt = worker.submit(() -> throttle.admitApi(actor, true));
            try {
                boolean waiting = false;
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
                while (System.nanoTime() < deadline) {
                    waiting = owner.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid))",
                            Long.class, blocker) > 0;
                    if (waiting) break;
                    Thread.sleep(10);
                }
                assertThat(waiting).as("Actual admission is blocked by the lower held key").isTrue();
                try (var statement = held.prepareStatement("SELECT key_hash FROM login_throttle_bucket WHERE key_hash=? FOR UPDATE NOWAIT")) {
                    statement.setBytes(1, higher);
                    statement.executeQuery().close();
                }
                held.commit();
                attempt.get(10, TimeUnit.SECONDS);
            } finally { held.rollback(); }
        }
        assertThat(attempts(actor, false)).isEqualTo(1);
        assertThat(attempts(actor, true)).isEqualTo(1);
    }

    private int compete(UUID actor, List<Boolean> modes) throws Exception {
        var start = new CountDownLatch(1);
        try (var threads = Executors.newFixedThreadPool(16)) {
            var results = new ArrayList<Future<Boolean>>();
            for (boolean write : modes) results.add(threads.submit(() -> {
                start.await();
                try { throttle.admitApi(actor, write); return true; }
                catch (LoginThrottled rejected) { return false; }
            }));
            start.countDown();
            int accepted = 0;
            for (var result : results) if (result.get(60, TimeUnit.SECONDS)) accepted++;
            return accepted;
        }
    }

    private int attempts(UUID actor, boolean write) {
        return owner.queryForObject("SELECT count(*) FROM login_attempt WHERE source_key=?", Integer.class, source(actor, write));
    }

    private byte[] source(UUID actor, boolean write) {
        return counterKey(write ? "api-write-account" : "api-account", actor.toString());
    }

    private byte[] counterKey(String scope, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal((scope + "\u0000" + value).getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException failure) { throw new IllegalStateException(failure); }
    }

    private static final class TestClock extends Clock {
        private final AtomicReference<Instant> now;
        private final ZoneId zone;
        TestClock() { this(new AtomicReference<>(Instant.parse("2026-10-23T00:00:00Z")), ZoneOffset.UTC); }
        private TestClock(AtomicReference<Instant> now, ZoneId zone) { this.now = now; this.zone = zone; }
        @Override public ZoneId getZone() { return zone; }
        @Override public Clock withZone(ZoneId value) { return new TestClock(now, value); }
        @Override public Instant instant() { return now.get(); }
        void advance(Duration duration) { now.updateAndGet(value -> value.plus(duration)); }
    }
}
