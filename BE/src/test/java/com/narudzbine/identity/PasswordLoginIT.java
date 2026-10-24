package com.narudzbine.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.narudzbine.audit.infrastructure.JdbcIdentityAudit;
import com.narudzbine.identity.api.CredentialProviderUnavailable;
import com.narudzbine.identity.api.InvalidLogin;
import com.narudzbine.identity.api.InvalidSession;
import com.narudzbine.identity.api.LoginThrottled;
import com.narudzbine.identity.api.PasswordCredentialVerifier;
import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.identity.application.LoginThrottle;
import com.narudzbine.identity.application.PasswordLoginService;
import com.narudzbine.identity.application.SessionService;
import com.narudzbine.organizations.infrastructure.JdbcMembershipAccess;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class PasswordLoginIT {
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336")
            .asCompatibleSubstituteFor("postgres"));
    private static JdbcTemplate owner;
    private static JdbcTemplate runtime;
    private static TransactionTemplate setup;
    private static DataSourceTransactionManager manager;
    private final MutableClock clock = new MutableClock();
    private LoginThrottle throttle;
    private SessionService sessions;

    @BeforeAll
    static void database() {
        MigrationCommand.migrate(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        var ownerSource = new DriverManagerDataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        owner = new JdbcTemplate(ownerSource);
        setup = new TransactionTemplate(new DataSourceTransactionManager(ownerSource));
        String password = UUID.randomUUID().toString();
        owner.execute("CREATE ROLE login_runtime LOGIN PASSWORD '" + password + "'");
        owner.execute("GRANT USAGE ON SCHEMA public TO login_runtime");
        owner.execute("GRANT INSERT ON audit_event TO login_runtime");
        owner.execute("GRANT SELECT, UPDATE ON account_identity, organization, business_account TO login_runtime");
        owner.execute("GRANT SELECT ON managed_password_identity TO login_runtime");
        owner.execute("GRANT SELECT, INSERT, UPDATE ON application_session, login_throttle_bucket, login_attempt TO login_runtime");
        var source = new DriverManagerDataSource(DATABASE.getJdbcUrl(), "login_runtime", password);
        runtime = new JdbcTemplate(source);
        manager = new DataSourceTransactionManager(source);
    }

    @BeforeEach
    void services() {
        byte[] key = new byte[32];
        new java.security.SecureRandom().nextBytes(key);
        throttle = new LoginThrottle(runtime, clock, new UuidGenerator(clock), key);
        sessions = new SessionService(runtime, new JdbcMembershipAccess(runtime), clock, new UuidGenerator(clock),
                new JdbcIdentityAudit(runtime, clock, new UuidGenerator(clock)));
    }

    @Test
    void verifiesOutsideTransactionAndUsesCurrentBoundIdentityWithoutStoringPassword() {
        var account = account();
        var login = login((email, password) -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(email).isEqualTo(account.email());
            assertThat(password).isEqualTo("  exact password text  ");
            return Optional.of(account.subject());
        });
        var result = login.login(" " + account.email().toUpperCase(java.util.Locale.ROOT) + " ",
                "  exact password text  ", SessionTransport.BROWSER, " Browser ", "192.0.2.1");
        assertThat(result.csrfToken()).isNotNull();
        assertThat(result.session().deviceLabel()).isEqualTo("Browser");
        UUID authenticated = new TransactionTemplate(manager).execute(status ->
                sessions.authenticate(result.secret(), SessionTransport.BROWSER).accountId());
        assertThat(authenticated).isEqualTo(account.id());
        assertThat(owner.queryForList("SELECT * FROM login_attempt").toString()).doesNotContain(account.email(), "192.0.2.1", "exact password");
        assertThatThrownBy(() -> new TransactionTemplate(manager).execute(status -> login.login(account.email(),
                "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.1")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void unknownUnmappedWrongSubjectAndDisabledAccountsCannotCreateSessions() {
        AtomicInteger calls = new AtomicInteger();
        var account = account();
        var login = login((email, password) -> { calls.incrementAndGet(); return Optional.of(account.subject()); });
        deny(login, UUID.randomUUID() + "@example.com");
        var wrong = account();
        deny(login, wrong.email());
        owner.update("UPDATE account_identity SET state = 'DEACTIVATED' WHERE id = ?", account.id());
        deny(login, account.email());
        assertThat(calls).hasValue(3);
        assertThat(sessionCount(account.id())).isZero();
        assertThat(sessionCount(wrong.id())).isZero();
    }

    @Test
    void accountEpochGenerationPendingBarrierAndEmailChangesDuringProviderCallInvalidateProof() {
        for (String update : new String[] {"security_epoch = security_epoch + 1",
                "credential_generation = credential_generation + 1", "credential_operation_pending = true",
                "email = '" + UUID.randomUUID() + "@example.com'"}) {
            var account = account();
            var login = login((email, password) -> {
                if(update.startsWith("email =")) { migratorEmailDrift(account.id()); }
                else { owner.update("UPDATE account_identity SET " + update + " WHERE id = ?", account.id()); }
                return Optional.of(account.subject());
            });
            deny(login, account.email());
            assertThat(sessionCount(account.id())).isZero();
        }
    }

    @Test
    void emailDriftRollsBackSessionCapEvictionAndPendingBarrierBlocksExistingSession() {
        var account = account();
        var good = login((email, password) -> Optional.of(account.subject()));
        String secret = null;
        for (int index = 0; index < 3; index++) {
            secret = good.login(account.email(), "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.2").secret();
        }
        var drift = login((email, password) -> {
            migratorEmailDrift(account.id());
            return Optional.of(account.subject());
        });
        deny(drift, account.email());
        assertThat(owner.queryForObject("SELECT count(*) FROM application_session WHERE account_id = ? AND revoked_at IS NULL",
                Integer.class, account.id())).isEqualTo(3);
        owner.update("UPDATE account_identity SET credential_operation_pending = true WHERE id = ?", account.id());
        String savedSecret = secret;
        assertThatThrownBy(() -> new TransactionTemplate(manager).execute(status -> sessions.authenticate(savedSecret, SessionTransport.NATIVE)))
                .isInstanceOf(InvalidSession.class);
    }

    @Test
    void providerOutageIsGenericAndDoesNotCountAsWrongPassword() {
        String email = UUID.randomUUID() + "@example.com";
        var login = login((submitted, password) -> { throw new CredentialProviderUnavailable(); });
        for (int index = 0; index < 30; index++) {
            assertThatThrownBy(() -> login.login(email, "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.3"))
                    .isInstanceOf(CredentialProviderUnavailable.class).hasNoCause();
        }
        assertThatThrownBy(() -> login.login(email, "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.3"))
                .isInstanceOf(LoginThrottled.class);
        // Different source, same email: no failed-password cooldown was recorded.
        assertThatThrownBy(() -> login.login(email, "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.4"))
                .isInstanceOf(CredentialProviderUnavailable.class);
    }

    @Test
    void cooldownIsRollingBoundedAndFailedCompletionIsIdempotent() {
        String email = UUID.randomUUID() + "@example.com";
        UUID fifth = null;
        for (int index = 0; index < 5; index++) {
            fifth = throttle.begin(email, "192.0.2.5");
            throttle.failed(fifth);
        }
        throttle.failed(fifth);
        assertCooldown(email, 1);
        for (int seconds : new int[] {1, 2, 4, 8, 16, 30}) {
            clock.advance(seconds);
            throttle.failed(throttle.begin(email, "192.0.2.5"));
            assertCooldown(email, Math.min(30, seconds * 2));
        }
        clock.advance(900);
        throttle.failed(throttle.begin(email, "192.0.2.5"));
        throttle.begin(email, "192.0.2.5");
    }

    @Test
    void concurrentRequestsCannotExceedSourceLimitAndExactWindowExpiryAllowsRetry() throws Exception {
        var start = new CountDownLatch(1);
        var outcomes = new ArrayList<java.util.concurrent.Future<Boolean>>();
        try (var pool = Executors.newFixedThreadPool(12)) {
            for (int index = 0; index < 40; index++) {
                outcomes.add(pool.submit(() -> {
                    assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                    try { throttle.begin(UUID.randomUUID() + "@example.com", "192.0.2.6"); return true; }
                    catch (LoginThrottled exception) { return false; }
                }));
            }
            start.countDown();
            int admitted = 0;
            for (var outcome : outcomes) { if (outcome.get(20, TimeUnit.SECONDS)) { admitted++; } }
            assertThat(admitted).isEqualTo(30);
        }
        clock.advance(900);
        throttle.begin("retry@example.com", "192.0.2.6");
    }

    @Test
    void providerBindingIsImmutableAndInvalidInputsDoNotReachProvider() {
        var account = account();
        assertThatThrownBy(() -> owner.update("UPDATE managed_password_identity SET provider_user_id = ? WHERE account_id = ?",
                UUID.randomUUID(), account.id())).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> owner.update("DELETE FROM managed_password_identity WHERE account_id = ?", account.id()))
                .isInstanceOf(DataAccessException.class);
        var login = login((email, password) -> { throw new AssertionError("Must not reach provider"); });
        assertThatThrownBy(() -> login.login("invalid", "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.7"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> login.login(account.email(), "short", SessionTransport.NATIVE, "Phone", "192.0.2.7"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void reauthenticationUsesCurrentAccountAndRotatesOnlyItsExistingSessionOutsideProviderTransaction() {
        var account = account();
        var service = login((email, password) -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(email).isEqualTo(account.email());
            assertThat(password).isEqualTo("valid long password");
            return Optional.of(account.subject());
        });
        var initial = service.login(account.email(), "valid long password", SessionTransport.BROWSER, "Browser", "192.0.2.20");
        var other = service.login(account.email(), "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.20");
        var before = owner.queryForMap("SELECT * FROM application_session WHERE id = ?", initial.session().id());
        clock.advance(301);
        var rotated = service.reauthenticate(initial.secret(), SessionTransport.BROWSER, initial.csrfToken(), "valid long password", "192.0.2.20");
        assertThat(rotated.session()).isEqualTo(initial.session());
        assertThat(rotated.secret()).isNotEqualTo(initial.secret());
        assertThat(rotated.csrfToken()).isNotEqualTo(initial.csrfToken());
        assertThat(sessionCount(account.id())).isEqualTo(2);
        var after = owner.queryForMap("SELECT * FROM application_session WHERE id = ?", initial.session().id());
        assertThat(after.get("absolute_expires_at")).isEqualTo(before.get("absolute_expires_at"));
        assertThat(after.get("last_qualified_activity_at")).isEqualTo(before.get("last_qualified_activity_at"));
        assertThat(after.get("auth_at")).isNotEqualTo(before.get("auth_at"));
        assertThat(after.get("auth_method_type")).isEqualTo("PASSWORD");
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            sessions.authenticate(other.secret(), SessionTransport.NATIVE);
            sessions.requireCsrf(rotated.secret(), rotated.csrfToken());
        });
        assertThatThrownBy(() -> service.reauthenticate(initial.secret(), SessionTransport.BROWSER, initial.csrfToken(),
                "valid long password", "192.0.2.20")).isInstanceOf(InvalidSession.class);
    }

    @Test
    void invalidSessionOrCsrfCannotReachReauthenticationProvider() {
        var account = account();
        var initial = login((email, password) -> Optional.of(account.subject())).login(account.email(),
                "valid long password", SessionTransport.BROWSER, "Browser", "192.0.2.21");
        var service = login((email, password) -> { throw new AssertionError("Provider must not be called"); });
        assertThatThrownBy(() -> service.reauthenticate("invalid", SessionTransport.NATIVE, null,
                "valid long password", "192.0.2.21")).isInstanceOf(InvalidSession.class);
        assertThatThrownBy(() -> service.reauthenticate(initial.secret(), SessionTransport.BROWSER, null,
                "valid long password", "192.0.2.21")).isInstanceOf(com.narudzbine.identity.api.InvalidCsrf.class);
        assertThatThrownBy(() -> service.reauthenticate(initial.secret(), SessionTransport.NATIVE, null,
                "valid long password", "192.0.2.21")).isInstanceOf(InvalidSession.class);
        assertThatThrownBy(() -> new TransactionTemplate(manager).execute(status -> service.reauthenticate(initial.secret(),
                SessionTransport.BROWSER, initial.csrfToken(), "valid long password", "192.0.2.21")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void failedPasswordAndProviderFailureDoNotRotateOrRefreshSessionAndShareLoginCooldown() {
        var account = account();
        var initial = login((email, password) -> Optional.of(account.subject())).login(account.email(),
                "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.22");
        var before = owner.queryForMap("SELECT token_hash, auth_at FROM application_session WHERE id = ?", initial.session().id());
        clock.advance(120);
        var outage = login((email, password) -> { throw new CredentialProviderUnavailable(); });
        assertThatThrownBy(() -> outage.reauthenticate(initial.secret(), SessionTransport.NATIVE, null,
                "valid long password", "192.0.2.22")).isInstanceOf(CredentialProviderUnavailable.class);
        var wrong = login((email, password) -> Optional.empty());
        for (int index = 0; index < 5; index++) {
            assertThatThrownBy(() -> wrong.reauthenticate(initial.secret(), SessionTransport.NATIVE, null,
                    "wrong long password", "192.0.2.22")).isInstanceOf(InvalidLogin.class);
        }
        assertThatThrownBy(() -> wrong.login(account.email(), "wrong long password", SessionTransport.NATIVE,
                "Phone", "192.0.2.23")).isInstanceOf(LoginThrottled.class);
        var after = owner.queryForMap("SELECT token_hash, auth_at FROM application_session WHERE id = ?", initial.session().id());
        assertThat((byte[]) after.get("token_hash")).isEqualTo((byte[]) before.get("token_hash"));
        assertThat(after.get("auth_at")).isEqualTo(before.get("auth_at"));
        new TransactionTemplate(manager).executeWithoutResult(status -> sessions.authenticate(initial.secret(), SessionTransport.NATIVE));
    }

    @Test
    void currentStateChangesDuringReauthenticationPreventRotation() {
        for (String update : new String[] {"security_epoch = security_epoch + 1", "credential_generation = credential_generation + 1",
                "credential_operation_pending = true", "state = 'DEACTIVATED'", "email = '" + UUID.randomUUID() + "@example.com'"}) {
            var account = account();
            var initial = login((email, password) -> Optional.of(account.subject())).login(account.email(),
                    "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.24");
            byte[] before = owner.queryForObject("SELECT token_hash FROM application_session WHERE id = ?", byte[].class, initial.session().id());
            var changing = login((email, password) -> {
                assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
                if(update.startsWith("email =")) { migratorEmailDrift(account.id()); }
                else { owner.update("UPDATE account_identity SET " + update + " WHERE id = ?", account.id()); }
                return Optional.of(account.subject());
            });
            assertThatThrownBy(() -> changing.reauthenticate(initial.secret(), SessionTransport.NATIVE, null,
                    "valid long password", "192.0.2.24")).isInstanceOf(InvalidSession.class);
            assertThat(owner.queryForObject("SELECT token_hash FROM application_session WHERE id = ?", byte[].class, initial.session().id()))
                    .isEqualTo(before);
        }
    }

    @Test
    void revocationOrExpiryDuringProviderCallCannotBeResurrected() {
        for (boolean revoke : new boolean[] {true, false}) {
            var account = account();
            var initial = login((email, password) -> Optional.of(account.subject())).login(account.email(),
                    "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.25");
            var changing = login((email, password) -> {
                if (revoke) {
                    new TransactionTemplate(manager).executeWithoutResult(status -> sessions.revokeCurrent(initial.secret(), SessionTransport.NATIVE));
                } else { clock.advance(1800); }
                return Optional.of(account.subject());
            });
            assertThatThrownBy(() -> changing.reauthenticate(initial.secret(), SessionTransport.NATIVE, null,
                    "valid long password", "192.0.2.25")).isInstanceOf(InvalidSession.class);
            assertThat(sessionCount(account.id())).isEqualTo(1);
        }
    }

    @Test
    void concurrentReauthenticationHasOneWinnerAndNoReplayOfRetiredSecret() throws Exception {
        var account = account();
        var initial = login((email, password) -> Optional.of(account.subject())).login(account.email(),
                "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.26");
        var entered = new CountDownLatch(2);
        var release = new CountDownLatch(1);
        var service = login((email, password) -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            entered.countDown();
            try { assertThat(release.await(10, TimeUnit.SECONDS)).isTrue(); }
            catch (InterruptedException exception) { throw new AssertionError(exception); }
            return Optional.of(account.subject());
        });
        try (var pool = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<String> operation = () -> {
                try { return service.reauthenticate(initial.secret(), SessionTransport.NATIVE, null,
                        "valid long password", "192.0.2.26").secret(); }
                catch (InvalidSession exception) { return "denied"; }
            };
            var first = pool.submit(operation);
            var second = pool.submit(operation);
            assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
            release.countDown();
            var outcomes = java.util.List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            assertThat(outcomes.stream().filter("denied"::equals).count()).isEqualTo(1);
            String winner = outcomes.stream().filter(value -> !value.equals("denied")).findFirst().orElseThrow();
            new TransactionTemplate(manager).executeWithoutResult(status -> sessions.authenticate(winner, SessionTransport.NATIVE));
            assertThat(sessionCount(account.id())).isEqualTo(1);
        } finally { release.countDown(); }
    }

    @Test
    void aDifferentVerifiedProviderSubjectCannotReauthenticateCurrentAccount() {
        var account = account();
        var other = account();
        var original = login((email, password) -> Optional.of(account.subject())).login(account.email(),
                "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.27");
        var wrongSubject = login((email, password) -> Optional.of(other.subject()));
        assertThatThrownBy(() -> wrongSubject.reauthenticate(original.secret(), SessionTransport.NATIVE, null,
                "valid long password", "192.0.2.27")).isInstanceOf(InvalidLogin.class);
        new TransactionTemplate(manager).executeWithoutResult(status -> sessions.authenticate(original.secret(), SessionTransport.NATIVE));
        assertThat(sessionCount(account.id())).isEqualTo(1);
        assertThat(sessionCount(other.id())).isZero();
    }

    private void assertCooldown(String email, long seconds) {
        assertThatThrownBy(() -> throttle.begin(email, "192.0.2.5"))
                .isInstanceOfSatisfying(LoginThrottled.class, error -> assertThat(error.retryAfterSeconds()).isEqualTo(seconds));
    }
    private void deny(PasswordLoginService login, String email) {
        assertThatThrownBy(() -> login.login(email, "valid long password", SessionTransport.NATIVE, "Phone", "192.0.2.8"))
                .isInstanceOf(InvalidLogin.class).hasMessage("The supplied credentials could not be accepted.");
    }
    private PasswordLoginService login(PasswordCredentialVerifier provider) {
        return new PasswordLoginService(runtime, manager, provider, throttle, sessions, clock);
    }
    /** Disposable schema-owner corruption fixture, not an application/recovery path. Runtime cannot disable triggers. */
    private void migratorEmailDrift(UUID account) {
        setup.executeWithoutResult(status -> {
            String next=UUID.randomUUID()+"@example.com";
            owner.execute("ALTER TABLE account_identity DISABLE TRIGGER tr_account_email_claim");
            owner.update("UPDATE account_identity SET email=? WHERE id=?",next,account);
            owner.update("DELETE FROM login_email_claim WHERE account_id=? AND kind='CURRENT'",account);
            owner.update("INSERT INTO login_email_claim(email,account_id,kind) VALUES (?,?,'CURRENT')",next,account);
            owner.execute("SET CONSTRAINTS ALL IMMEDIATE");
            owner.execute("ALTER TABLE account_identity ENABLE TRIGGER tr_account_email_claim");
        });
    }
    private int sessionCount(UUID account) {
        return owner.queryForObject("SELECT count(*) FROM application_session WHERE account_id = ?", Integer.class, account);
    }
    private Account account() {
        UUID id = UUID.randomUUID();
        String email = id + "@example.com";
        var subject = new PasswordCredentialVerifier.Subject(UUID.randomUUID(), UUID.randomUUID());
        setup.executeWithoutResult(status -> {
            owner.update("""
                    INSERT INTO account_identity(id, kind, email, email_verified, display_name, state)
                    VALUES (?, 'PLATFORM_ADMIN', ?, true, 'Test administrator', 'ACTIVE')
                    """, id, email);
            owner.update("INSERT INTO platform_account(id) VALUES (?)", id);
            owner.update("INSERT INTO managed_password_identity(account_id, tenant_id, provider_user_id) VALUES (?, ?, ?)",
                    id, subject.tenantId(), subject.userId());
        });
        return new Account(id, email, subject);
    }
    private record Account(UUID id, String email, PasswordCredentialVerifier.Subject subject) { }
    private static final class MutableClock extends Clock {
        private Instant instant = Instant.parse("2026-10-17T12:00:00Z");
        void advance(long seconds) { instant = instant.plusSeconds(seconds); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return instant; }
    }
}
