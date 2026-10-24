package com.narudzbine.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.narudzbine.audit.infrastructure.JdbcIdentityAudit;
import com.narudzbine.BackendApplication;
import com.narudzbine.identity.api.InaccessibleSession;
import com.narudzbine.identity.api.InvalidCsrf;
import com.narudzbine.identity.api.InvalidSession;
import com.narudzbine.identity.api.SessionCredentials;
import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.identity.api.VerifiedPasswordProof;
import com.narudzbine.identity.application.SessionService;
import com.narudzbine.organizations.infrastructure.JdbcMembershipAccess;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.boot.SpringApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.IllegalTransactionStateException;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class SessionServiceIT {
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336")
            .asCompatibleSubstituteFor("postgres"));
    private static JdbcTemplate owner;
    private static TransactionTemplate setupTransaction;
    private static JdbcTemplate runtime;
    private static TransactionTemplate transaction;
    private final MutableClock clock = new MutableClock();
    private SessionService sessions;

    @BeforeAll
    static void setupDatabase() {
        MigrationCommand.migrate(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        var ownerSource = new DriverManagerDataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        owner = new JdbcTemplate(ownerSource);
        setupTransaction = new TransactionTemplate(new DataSourceTransactionManager(ownerSource));
        String password = UUID.randomUUID().toString();
        owner.execute("CREATE ROLE session_runtime LOGIN PASSWORD '" + password + "'");
        owner.execute("GRANT USAGE ON SCHEMA public TO session_runtime");
        owner.execute("GRANT INSERT ON audit_event TO session_runtime");
        owner.execute("GRANT SELECT, UPDATE ON organization, business_account, account_identity TO session_runtime");
        owner.execute("GRANT SELECT, INSERT, UPDATE ON application_session TO session_runtime");
        owner.execute("GRANT SELECT ON managed_password_identity, external_identity, backend_schema_version, flyway_schema_history TO session_runtime");
        var source = new DriverManagerDataSource(DATABASE.getJdbcUrl(), "session_runtime", password);
        runtime = new JdbcTemplate(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        transaction.setTimeout(10);
    }

    @BeforeEach
    void setupService() {
        sessions = new SessionService(runtime, new JdbcMembershipAccess(runtime), clock, new UuidGenerator(clock),
                new JdbcIdentityAudit(runtime, clock, new UuidGenerator(clock)));
    }

    @Test
    void springManagedSessionServiceJoinsJpaTransactionAndRollsBackItsJdbcWrites() {
        UUID account = account(true);
        var application = new SpringApplication(BackendApplication.class);
        // Synthetic test-only credentials; ordinary runtime configuration uses environment secrets.
        var source = (DriverManagerDataSource) runtime.getDataSource();
        try (var context = application.run("--spring.datasource.url=" + DATABASE.getJdbcUrl(),
                "--spring.datasource.username=" + source.getUsername(),
                "--spring.datasource.password=" + source.getPassword(), "--server.port=0", "--management.server.port=0",
                "--logging.level.root=WARN", "--spring.main.banner-mode=off")) {
            var managed = context.getBean(SessionService.class);
            var boundary = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
            var proof = new VerifiedPasswordProof(account, 0, 0, Instant.now());
            assertThatThrownBy(() -> managed.issue(proof, SessionTransport.NATIVE, "Test device"))
                    .isInstanceOf(IllegalTransactionStateException.class);
            assertThatThrownBy(() -> boundary.execute(status -> {
                managed.issue(proof, SessionTransport.NATIVE, "Test device");
                throw new IllegalStateException("Synthetic business rollback");
            })).isInstanceOf(IllegalStateException.class).hasMessage("Synthetic business rollback");
            assertThat(activeCount(account)).isZero();
        }
    }

    @Test
    void secretsAreIndependentHashedAndTransportBound() {
        UUID account = account(false);
        var browser = issue(account, SessionTransport.BROWSER);
        assertThat(browser.secret()).matches("[A-Za-z0-9_-]{43}");
        assertThat(browser.csrfToken()).matches("[A-Za-z0-9_-]{43}").isNotEqualTo(browser.secret());
        assertThat(browser.toString()).doesNotContain(browser.secret(), browser.csrfToken());
        assertThat(browser.session().id().version()).isEqualTo(7);
        assertThat(browser.session().id().variant()).isEqualTo(2);
        assertThat(browser.session().id().getMostSignificantBits() >>> 16).isEqualTo(clock.millis());
        var stored = owner.queryForMap("""
                SELECT encode(token_hash, 'hex') AS token, encode(csrf_token_hash, 'hex') AS csrf
                FROM application_session WHERE id = ?
                """, browser.session().id());
        assertThat(stored.get("token").toString()).matches("[0-9a-f]{64}").isNotEqualTo(browser.secret());
        assertThat(stored.get("csrf").toString()).matches("[0-9a-f]{64}").isNotEqualTo(browser.csrfToken());
        assertThat(stored.toString()).doesNotContain(browser.secret(), browser.csrfToken());
        tx(() -> { sessions.requireCsrf(browser.secret(), browser.csrfToken()); return null; });
        assertThatThrownBy(() -> tx(() -> { sessions.requireCsrf(browser.secret(), null); return null; }))
                .isInstanceOf(InvalidCsrf.class);
        assertThatThrownBy(() -> tx(() -> { sessions.requireCsrf(browser.secret(), browser.secret()); return null; }))
                .isInstanceOf(InvalidCsrf.class);
        invalid(browser.secret(), SessionTransport.NATIVE);
        var nativeSession = issue(account, SessionTransport.NATIVE);
        assertThat(nativeSession.csrfToken()).isNull();
        invalid(nativeSession.secret(), SessionTransport.BROWSER);
        invalid("not-a-session", SessionTransport.NATIVE);
        invalid(UUID.randomUUID().toString(), SessionTransport.NATIVE);
    }

    @Test
    void backgroundChecksDoNotExtendIdleExpiryAndExactDeadlineExpires() {
        UUID account = account(false);
        var session = issue(account, SessionTransport.NATIVE);
        clock.advance(Duration.ofDays(6));
        valid(session);
        assertThat(tx(() -> sessions.list(session.secret(), SessionTransport.NATIVE)).getFirst().lastActivityAt())
                .isEqualTo(session.session().createdAt());
        clock.advance(Duration.ofDays(1));
        invalid(session.secret(), SessionTransport.NATIVE);
    }

    @Test
    void qualifyingActivityIsMonotonicAndRolledBackWithFailedCommand() {
        var session = issue(account(false), SessionTransport.NATIVE);
        clock.advance(Duration.ofDays(6));
        Instant updated = clock.instant();
        activity(session);
        clock.advance(Duration.ofSeconds(-1));
        activity(session);
        assertThat(lastActivity(session)).isEqualTo(updated);
        clock.advance(Duration.ofDays(1));
        assertThatThrownBy(() -> tx(() -> {
            sessions.recordSuccessfulActivity(session.secret(), SessionTransport.NATIVE);
            throw new IllegalStateException("Synthetic command failure");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(lastActivity(session)).isEqualTo(updated);
        clock.set(updated.plus(Duration.ofDays(7)));
        invalid(session.secret(), SessionTransport.NATIVE);
    }

    @Test
    void activityCannotExtendBusinessAbsoluteDeadline() {
        var session = issue(account(false), SessionTransport.NATIVE);
        for (int step = 0; step < 4; step++) {
            clock.advance(Duration.ofDays(6));
            activity(session);
        }
        clock.set(session.session().createdAt().plus(Duration.ofDays(30)).minusMillis(1));
        activity(session);
        clock.advance(Duration.ofMillis(1));
        invalid(session.secret(), SessionTransport.NATIVE);
    }

    @Test
    void platformSessionsHaveShorterIdleAndAbsoluteLifetimes() {
        UUID admin = account(true);
        var idle = issue(admin, SessionTransport.NATIVE);
        clock.advance(Duration.ofMinutes(30));
        invalid(idle.secret(), SessionTransport.NATIVE);
        var absolute = issue(admin, SessionTransport.NATIVE);
        for (int step = 0; step < 35; step++) {
            clock.advance(Duration.ofMinutes(20));
            activity(absolute);
        }
        clock.set(absolute.session().createdAt().plus(Duration.ofHours(12)).minusMillis(1));
        activity(absolute);
        clock.advance(Duration.ofMillis(1));
        invalid(absolute.secret(), SessionTransport.NATIVE);
    }

    @Test
    void rotationPreservesIdentityAndAbsoluteLifetimeAndInvalidatesBothOldSecrets() {
        UUID account = account(false);
        var initial = issue(account, SessionTransport.BROWSER);
        var absolute = owner.queryForObject("SELECT absolute_expires_at FROM application_session WHERE id = ?",
                Timestamp.class, initial.session().id());
        clock.advance(Duration.ofDays(1));
        var rotated = tx(() -> sessions.reauthenticate(initial.secret(), SessionTransport.BROWSER, proof(account)));
        assertThat(rotated.session().id()).isEqualTo(initial.session().id());
        assertThat(rotated.session().createdAt()).isEqualTo(initial.session().createdAt());
        assertThat(rotated.secret()).isNotEqualTo(initial.secret());
        assertThat(rotated.csrfToken()).isNotEqualTo(initial.csrfToken());
        assertThat(owner.queryForObject("SELECT absolute_expires_at FROM application_session WHERE id = ?",
                Timestamp.class, initial.session().id())).isEqualTo(absolute);
        invalid(initial.secret(), SessionTransport.BROWSER);
        assertThatThrownBy(() -> tx(() -> {
            sessions.requireCsrf(rotated.secret(), initial.csrfToken()); return null;
        })).isInstanceOf(InvalidCsrf.class);
        var authenticated = tx(() -> sessions.authenticate(rotated.secret(), SessionTransport.BROWSER));
        assertThat(authenticated.authenticatedAt()).isEqualTo(clock.instant());
        assertThatThrownBy(() -> tx(() -> sessions.reauthenticate(rotated.secret(), SessionTransport.BROWSER,
                proof(account(true))))).isInstanceOf(InvalidSession.class);
    }

    @Test
    void capsEvictOldestOnlyAfterValidProofAndIgnoreExpiredRows() {
        UUID account = account(false);
        var created = new ArrayList<SessionCredentials>();
        for (int index = 0; index < 10; index++) {
            created.add(issue(account, SessionTransport.NATIVE));
            clock.advance(Duration.ofMillis(1));
        }
        var stale = new VerifiedPasswordProof(account, 0, 0, clock.instant().minusSeconds(60));
        assertThatThrownBy(() -> tx(() -> sessions.issue(stale, SessionTransport.NATIVE, "Test device")))
                .isInstanceOf(InvalidSession.class);
        assertThat(activeCount(account)).isEqualTo(10);
        valid(created.getFirst());
        var replacement = issue(account, SessionTransport.NATIVE);
        invalid(created.getFirst().secret(), SessionTransport.NATIVE);
        assertThat(activeCount(account)).isEqualTo(10);
        assertThat(tx(() -> sessions.list(replacement.secret(), SessionTransport.NATIVE))).hasSize(10);
        assertThat(tx(() -> sessions.list(replacement.secret(), SessionTransport.NATIVE)).getFirst().id())
                .isEqualTo(replacement.session().id());
        clock.advance(Duration.ofDays(7));
        var fresh = issue(account, SessionTransport.NATIVE);
        assertThat(tx(() -> sessions.list(fresh.secret(), SessionTransport.NATIVE))).hasSize(1);
    }

    @Test
    void concurrentLoginsEnforcePlatformCapAtomically() throws Exception {
        UUID admin = account(true);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(6)) {
            var futures = new ArrayList<java.util.concurrent.Future<SessionCredentials>>();
            for (int index = 0; index < 6; index++) {
                futures.add(executor.submit(() -> {
                    if (!start.await(5, TimeUnit.SECONDS)) {
                        throw new AssertionError("Login race did not start");
                    }
                    return issue(admin, SessionTransport.NATIVE);
                }));
            }
            start.countDown();
            for (var future : futures) {
                assertThat(future.get(10, TimeUnit.SECONDS)).isNotNull();
            }
        }
        assertThat(activeCount(admin)).isEqualTo(3);
        assertThat(owner.queryForObject("SELECT count(*) FROM application_session WHERE account_id = ?",
                Integer.class, admin)).isEqualTo(6);
    }

    @Test
    void concurrentRotationCanConsumeTheOldSecretOnlyOnce() throws Exception {
        UUID admin = account(true);
        var initial = issue(admin, SessionTransport.NATIVE);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<String> rotate = () -> {
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("Rotation race did not start");
                }
                try {
                    tx(() -> sessions.reauthenticate(initial.secret(), SessionTransport.NATIVE, proof(admin)));
                    return "rotated";
                } catch (InvalidSession exception) {
                    return "denied";
                }
            };
            var first = executor.submit(rotate);
            var second = executor.submit(rotate);
            start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("rotated", "denied");
        }
        invalid(initial.secret(), SessionTransport.NATIVE);
        assertThat(activeCount(admin)).isEqualTo(1);
    }

    @Test
    void revocationIsScopedAndCurrentLogoutDoesNotRevokeOtherDevices() {
        UUID account = account(false);
        var first = issue(account, SessionTransport.NATIVE);
        var second = issue(account, SessionTransport.NATIVE);
        var other = issue(account(true), SessionTransport.NATIVE);
        assertThatThrownBy(() -> tx(() -> {
            sessions.revokeOther(first.secret(), SessionTransport.NATIVE, other.session().id()); return null;
        })).isInstanceOf(InaccessibleSession.class);
        tx(() -> { sessions.revokeCurrent(first.secret(), SessionTransport.NATIVE); return null; });
        invalid(first.secret(), SessionTransport.NATIVE);
        valid(second);
        valid(other);
        tx(() -> { sessions.revokeAll(second.secret(), SessionTransport.NATIVE); return null; });
        invalid(second.secret(), SessionTransport.NATIVE);
        valid(other);
    }

    @Test
    void currentEpochGenerationAndAccountOrOrganizationStateAreAlwaysRechecked() {
        for (String field : List.of("security_epoch", "credential_generation")) {
            UUID account = account(false);
            var session = issue(account, SessionTransport.NATIVE);
            owner.update("UPDATE account_identity SET " + field + " = " + field + " + 1 WHERE id = ?", account);
            invalid(session.secret(), SessionTransport.NATIVE);
            assertThatThrownBy(() -> tx(() -> sessions.issue(new VerifiedPasswordProof(account, 0, 0, clock.instant()),
                    SessionTransport.NATIVE, "Test device"))).isInstanceOf(InvalidSession.class);
        }
        UUID admin = account(true);
        var platformSession = issue(admin, SessionTransport.NATIVE);
        owner.update("UPDATE account_identity SET state = 'DEACTIVATED' WHERE id = ?", admin);
        invalid(platformSession.secret(), SessionTransport.NATIVE);
        UUID buyer = account(false);
        var businessSession = issue(buyer, SessionTransport.NATIVE);
        owner.update("UPDATE organization SET state = 'SUSPENDED' WHERE owner_account_id = ?", buyer);
        invalid(businessSession.secret(), SessionTransport.NATIVE);
    }

    @Test
    void databaseRejectsReassignmentLifetimeExtensionAndUndoingRevocation() {
        var session = issue(account(false), SessionTransport.NATIVE);
        UUID other = account(true);
        assertThatThrownBy(() -> owner.update("UPDATE application_session SET account_id = ? WHERE id = ?",
                other, session.session().id())).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> owner.update("""
                UPDATE application_session SET absolute_expires_at = absolute_expires_at + interval '1 day' WHERE id = ?
                """, session.session().id())).isInstanceOf(DataAccessException.class);
        tx(() -> { sessions.revokeCurrent(session.secret(), SessionTransport.NATIVE); return null; });
        assertThatThrownBy(() -> owner.update("UPDATE application_session SET revoked_at = NULL WHERE id = ?",
                session.session().id())).isInstanceOf(DataAccessException.class);
    }

    @Test
    void sessionOperationsRequireTransactionAndRejectBadProofOrDeviceLabelBeforeEviction() {
        UUID admin = account(true);
        assertThatThrownBy(() -> sessions.issue(proof(admin), SessionTransport.NATIVE, "Device"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> tx(() -> sessions.issue(proof(admin), SessionTransport.NATIVE, "bad\nlabel")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tx(() -> sessions.issue(new VerifiedPasswordProof(admin, 0, 0,
                clock.instant().plusSeconds(1)), SessionTransport.NATIVE, "Device"))).isInstanceOf(InvalidSession.class);
        assertThat(activeCount(admin)).isZero();
        clock.set(clock.instant().plusNanos(123456));
        // Provider timestamps may have finer precision than the millisecond wire/database convention.
        assertThat(issue(admin, SessionTransport.NATIVE).session().createdAt().getNano() % 1_000_000).isZero();
    }

    @Test
    void auditContainsOriginalScopeAndSafeMetadataOnly() {
        for (boolean platform : List.of(false, true)) {
            UUID account = account(platform);
            var session = issue(account, SessionTransport.BROWSER);
            var event = owner.queryForMap("SELECT * FROM audit_event WHERE actor_id = ?", account);
            assertThat(event.get("actor_type")).isEqualTo(platform ? "PLATFORM_ADMIN" : "BUSINESS");
            assertThat(event.get("action")).isEqualTo("SESSION_CREATED");
            assertThat(event.get("resource_id")).isEqualTo(session.session().id());
            assertThat(event.get("outcome")).isEqualTo("SUCCESS");
            assertThat(((UUID) event.get("id")).version()).isEqualTo(7);
            assertThat(((UUID) event.get("request_id")).version()).isEqualTo(7);
            assertThat(((Timestamp) event.get("occurred_at")).toInstant()).isEqualTo(clock.instant());
            if (platform) {
                assertThat(event.get("organization_id")).isNull();
                assertThat(event.get("country")).isNull();
            } else {
                assertThat(event.get("organization_id")).isEqualTo(owner.queryForObject(
                        "SELECT organization_id FROM business_account WHERE id = ?", UUID.class, account));
                assertThat(event.get("country")).isEqualTo("RS");
            }
            assertThat(event.toString()).doesNotContain(session.secret(), session.csrfToken(),
                    account + "@example.test", "Synthetic test device", "Synthetic account");
        }
    }

    @Test
    void auditFailureRollsBackCreationEvictionRotationAndRevocation() {
        UUID account = account(true);
        var first = issue(account, SessionTransport.NATIVE);
        issue(account, SessionTransport.NATIVE);
        issue(account, SessionTransport.NATIVE);
        int initial = auditCount(account);
        UUID emptyAccount = account(true);
        owner.execute("REVOKE INSERT ON audit_event FROM session_runtime");
        try {
            assertThatThrownBy(() -> issue(emptyAccount, SessionTransport.NATIVE)).isInstanceOf(DataAccessException.class);
            assertThatThrownBy(() -> issue(account, SessionTransport.NATIVE)).isInstanceOf(DataAccessException.class);
            assertThatThrownBy(() -> tx(() -> sessions.reauthenticate(first.secret(), SessionTransport.NATIVE, proof(account))))
                    .isInstanceOf(DataAccessException.class);
            assertThatThrownBy(() -> tx(() -> { sessions.revokeAll(first.secret(), SessionTransport.NATIVE); return null; }))
                    .isInstanceOf(DataAccessException.class);
            assertThatThrownBy(() -> tx(() -> { sessions.logout(first.secret(), SessionTransport.NATIVE, null); return null; }))
                    .isInstanceOf(DataAccessException.class);
        } finally {
            owner.execute("GRANT INSERT ON audit_event TO session_runtime");
        }
        valid(first);
        assertThat(activeCount(account)).isEqualTo(3);
        assertThat(auditCount(account)).isEqualTo(initial);
        assertThat(activeCount(emptyAccount)).isZero();
        assertThat(auditCount(emptyAccount)).isZero();
    }

    @Test
    void outerRollbackRemovesBothSessionAndAuditAndWriterRejectsMissingOrReadOnlyTransaction() {
        UUID account = account(true);
        var writer = new JdbcIdentityAudit(runtime, clock, new UuidGenerator(clock));
        assertThatThrownBy(() -> writer.record(com.narudzbine.audit.api.SessionAuditAction.SESSION_CREATED,
                account, UUID.randomUUID())).isInstanceOf(IllegalStateException.class);
        var readOnly = new TransactionTemplate(transaction.getTransactionManager());
        readOnly.setReadOnly(true);
        assertThatThrownBy(() -> readOnly.execute(status -> {
            writer.record(com.narudzbine.audit.api.SessionAuditAction.SESSION_CREATED, account, UUID.randomUUID());
            return null;
        })).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> tx(() -> {
            sessions.issue(proof(account), SessionTransport.NATIVE, "Device");
            throw new IllegalStateException("Synthetic rollback");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(activeCount(account)).isZero();
        assertThat(auditCount(account)).isZero();
    }

    @Test
    void auditIsAppendOnlyEvenWithAccidentallyBroadenedDmlGrants() {
        UUID account = account(true);
        issue(account, SessionTransport.NATIVE);
        assertThatThrownBy(() -> runtime.queryForObject("SELECT count(*) FROM audit_event", Integer.class))
                .isInstanceOf(DataAccessException.class);
        owner.execute("GRANT SELECT, UPDATE, DELETE, TRUNCATE ON audit_event TO session_runtime");
        owner.execute("GRANT TRUNCATE ON support_read_evidence, privacy_review_access, privacy_review_read, retention_hold, privacy_export_job, privacy_export_event, privacy_fulfillment, audit_archive_spool, audit_archive_member, privacy_redaction_job, privacy_redaction_event, privacy_redaction_progress, privacy_redaction_apply_source, privacy_redaction_apply_item, privacy_identity_observation, privacy_case_disposition TO session_runtime");
        try {
            assertThatThrownBy(() -> runtime.update("UPDATE audit_event SET outcome = 'SUCCESS' WHERE actor_id = ?", account))
                    .isInstanceOf(DataAccessException.class).hasStackTraceContaining("Audit events are append-only");
            assertThatThrownBy(() -> runtime.update("DELETE FROM audit_event WHERE actor_id = ?", account))
                    .isInstanceOf(DataAccessException.class).hasStackTraceContaining("Audit events are append-only");
            assertThatThrownBy(() -> runtime.execute("TRUNCATE audit_event"))
                    .isInstanceOf(DataAccessException.class).hasStackTraceContaining("foreign key constraint");
            // Even bypassing that FK guard with all required accidental grants cannot erase audit history.
            assertThatThrownBy(() -> runtime.execute("TRUNCATE audit_event CASCADE"))
                    .isInstanceOf(DataAccessException.class).hasStackTraceContaining("Audit events are append-only");
        } finally {
            owner.execute("REVOKE TRUNCATE ON support_read_evidence, privacy_review_access, privacy_review_read, retention_hold, privacy_export_job, privacy_export_event, privacy_fulfillment, audit_archive_spool, audit_archive_member, privacy_redaction_job, privacy_redaction_event, privacy_redaction_progress, privacy_redaction_apply_source, privacy_redaction_apply_item, privacy_identity_observation, privacy_case_disposition FROM session_runtime");
            owner.execute("REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON audit_event FROM session_runtime");
        }
        assertThat(auditCount(account)).isEqualTo(1);
    }

    @Test
    void changedSessionActionsAreAuditedOnceWhileReadsNoOpsAndFailuresAreNot() {
        UUID account = account(true);
        var first = issue(account, SessionTransport.NATIVE);
        clock.advance(Duration.ofSeconds(1));
        var second = issue(account, SessionTransport.NATIVE);
        issue(account, SessionTransport.NATIVE);
        var fourth = issue(account, SessionTransport.NATIVE);
        assertThat(auditCount(account)).isEqualTo(5); // Four creations, one eviction.
        assertThat(owner.queryForObject("SELECT resource_id FROM audit_event WHERE actor_id = ? AND action = 'SESSION_EVICTED'",
                UUID.class, account)).isEqualTo(first.session().id());
        valid(second);
        activity(second);
        tx(() -> sessions.list(second.secret(), SessionTransport.NATIVE));
        invalid("bad-token", SessionTransport.NATIVE);
        for (int index = 0; index < 2; index++) {
            tx(() -> { sessions.revokeOther(second.secret(), SessionTransport.NATIVE, fourth.session().id()); return null; });
        }
        assertThat(auditCount(account)).isEqualTo(6);
        var rotated = tx(() -> sessions.reauthenticate(second.secret(), SessionTransport.NATIVE, proof(account)));
        assertThat(auditCount(account)).isEqualTo(7);
        tx(() -> { sessions.revokeAll(rotated.secret(), SessionTransport.NATIVE); return null; });
        assertThat(auditCount(account)).isEqualTo(9);
        assertThat(owner.queryForObject("SELECT count(*) FROM audit_event WHERE actor_id = ? AND action = 'SESSION_REVOKED_ALL'",
                Integer.class, account)).isEqualTo(2);
    }

    @Test
    void concurrentLogoutProducesOneAuditEvent() throws Exception {
        UUID account = account(true);
        var session = issue(account, SessionTransport.NATIVE);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var tasks = new ArrayList<java.util.concurrent.Future<?>>();
            for (int index = 0; index < 2; index++) {
                tasks.add(executor.submit(() -> {
                    assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
                    tx(() -> { sessions.logout(session.secret(), SessionTransport.NATIVE, null); return null; });
                    return null;
                }));
            }
            start.countDown();
            for (var task : tasks) { task.get(10, TimeUnit.SECONDS); }
        }
        assertThat(auditCount(account)).isEqualTo(2);
        assertThat(owner.queryForObject("SELECT count(*) FROM audit_event WHERE actor_id = ? AND action = 'SESSION_LOGGED_OUT'",
                Integer.class, account)).isEqualTo(1);
    }

    @Test
    void logoutAuditDoesNotAcquireOrganizationLocksAfterAccountLocks() throws Exception {
        UUID account = account(false);
        var session = issue(account, SessionTransport.NATIVE);
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var holding = executor.submit(() -> setupTransaction.execute(status -> {
                owner.queryForObject("SELECT id FROM organization WHERE owner_account_id = ? FOR UPDATE", UUID.class, account);
                locked.countDown();
                try {
                    assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Interrupted test lock", exception);
                }
                return null;
            }));
            try {
                assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
                var logout = executor.submit(() -> tx(() -> {
                    sessions.logout(session.secret(), SessionTransport.NATIVE, null);
                    return null;
                }));
                logout.get(5, TimeUnit.SECONDS);
            } finally {
                release.countDown();
            }
            holding.get(5, TimeUnit.SECONDS);
        }
        assertThat(activeCount(account)).isZero();
        assertThat(auditCount(account)).isEqualTo(2);
    }

    @Test
    void organizationWriteAcquiresExclusiveOrganizationBeforeWaitingForAccount() throws Exception {
        UUID account = account(false);
        var session = issue(account, SessionTransport.NATIVE);
        var accountLocked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var holding = executor.submit(() -> setupTransaction.execute(status -> {
                owner.queryForObject("SELECT id FROM account_identity WHERE id = ? FOR UPDATE", UUID.class, account);
                accountLocked.countDown();
                try { assertThat(release.await(10, TimeUnit.SECONDS)).isTrue(); }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException(exception); }
                return null;
            }));
            try {
                assertThat(accountLocked.await(5, TimeUnit.SECONDS)).isTrue();
                var command = executor.submit(() -> tx(() -> sessions.authenticateForOrganizationWrite(session.secret(), SessionTransport.NATIVE)));
                boolean exclusive = false;
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                while (!exclusive && System.nanoTime() < deadline) {
                    try {
                        setupTransaction.execute(status -> owner.queryForObject(
                                "SELECT id FROM organization WHERE owner_account_id = ? FOR SHARE NOWAIT", UUID.class, account));
                        Thread.sleep(25);
                    } catch (DataAccessException exception) {
                        assertThat(exception.getMostSpecificCause()).isInstanceOf(java.sql.SQLException.class);
                        assertThat(((java.sql.SQLException) exception.getMostSpecificCause()).getSQLState()).isEqualTo("55P03");
                        exclusive = true;
                    }
                }
                assertThat(exclusive).isTrue();
                release.countDown();
                assertThat(command.get(5, TimeUnit.SECONDS).accountId()).isEqualTo(account);
            } finally { release.countDown(); }
            holding.get(5, TimeUnit.SECONDS);
        }
    }

    private static int auditCount(UUID account) {
        return owner.queryForObject("SELECT count(*) FROM audit_event WHERE actor_id = ?", Integer.class, account);
    }

    private SessionCredentials issue(UUID account, SessionTransport transport) {
        return tx(() -> sessions.issue(proof(account), transport, "Synthetic test device"));
    }

    private VerifiedPasswordProof proof(UUID account) {
        return new VerifiedPasswordProof(account, 0, 0, clock.instant());
    }

    private void valid(SessionCredentials credentials) {
        assertThat(tx(() -> sessions.authenticate(credentials.secret(), SessionTransport.NATIVE)).sessionId())
                .isEqualTo(credentials.session().id());
    }

    private void invalid(String token, SessionTransport transport) {
        assertThatThrownBy(() -> tx(() -> sessions.authenticate(token, transport))).isInstanceOf(InvalidSession.class);
    }

    private void activity(SessionCredentials credentials) {
        tx(() -> { sessions.recordSuccessfulActivity(credentials.secret(), SessionTransport.NATIVE); return null; });
    }

    private Instant lastActivity(SessionCredentials session) {
        return owner.queryForObject("SELECT last_qualified_activity_at FROM application_session WHERE id = ?",
                Timestamp.class, session.session().id()).toInstant();
    }

    private static int activeCount(UUID account) {
        return owner.queryForObject("SELECT count(*) FROM application_session WHERE account_id = ? AND revoked_at IS NULL",
                Integer.class, account);
    }

    private static <T> T tx(Supplier<T> work) {
        return transaction.execute(status -> work.get());
    }

    private static UUID account(boolean platform) {
        UUID id = UUID.randomUUID();
        setupTransaction.executeWithoutResult(status -> {
            owner.update("""
                    INSERT INTO account_identity (id, kind, email, email_verified, display_name, state)
                    VALUES (?, ?, ?, true, 'Synthetic account', 'ACTIVE')
                    """, id, platform ? "PLATFORM_ADMIN" : "BUSINESS", id + "@example.test");
            if (platform) {
                owner.update("INSERT INTO platform_account (id) VALUES (?)", id);
            } else {
                UUID organization = UUID.randomUUID();
                owner.update("""
                        INSERT INTO organization (id, owner_account_id, type, country, currency, display_name, legal_name,
                            registration_identifier, address_line1, address_city, address_postal_code, address_country,
                            default_language, state)
                        VALUES (?, ?, 'BUYER', 'RS', 'RSD', 'Synthetic', 'Synthetic', ?, 'Test street', 'Test city',
                            '00000', 'RS', 'en', 'ACTIVE')
                        """, organization, id, organization.toString());
                owner.update("INSERT INTO business_account (id, organization_id, role) VALUES (?, ?, 'OWNER')", id, organization);
            }
        });
        return id;
    }

    private static final class MutableClock extends Clock {
        private volatile Instant current = Instant.parse("2026-10-17T09:00:00Z");

        void advance(Duration duration) { current = current.plus(duration); }
        void set(Instant instant) { current = instant; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(current, zone); }
        @Override public Instant instant() { return current; }
    }
}
