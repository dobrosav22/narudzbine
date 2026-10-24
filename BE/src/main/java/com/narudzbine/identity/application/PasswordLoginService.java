package com.narudzbine.identity.application;

import com.narudzbine.identity.api.InvalidLogin;
import com.narudzbine.identity.api.InvalidSession;
import com.narudzbine.identity.api.PasswordCredentialVerifier;
import com.narudzbine.identity.api.SessionCredentials;
import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.identity.api.VerifiedPasswordProof;
import java.time.Clock;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Construct only with an explicitly configured provider and dedicated throttle key. */
public final class PasswordLoginService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final PasswordCredentialVerifier provider;
    private final LoginThrottle throttle;
    private final SessionService sessions;
    private final Clock clock;
    private final PasswordLifecycleService passwords;
    private final EmailChangeService emails;

    public PasswordLoginService(JdbcTemplate jdbc, PlatformTransactionManager manager,
            PasswordCredentialVerifier provider, LoginThrottle throttle, SessionService sessions, Clock clock) {
        this(jdbc,manager,provider,throttle,sessions,clock,null);
    }

    public PasswordLoginService(JdbcTemplate jdbc, PlatformTransactionManager manager,
            PasswordCredentialVerifier provider, LoginThrottle throttle, SessionService sessions, Clock clock, PasswordLifecycleService passwords) {
        this(jdbc,manager,provider,throttle,sessions,clock,passwords,null);
    }
    public PasswordLoginService(JdbcTemplate jdbc,PlatformTransactionManager manager,PasswordCredentialVerifier provider,
            LoginThrottle throttle,SessionService sessions,Clock clock,PasswordLifecycleService passwords,EmailChangeService emails) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(manager);
        this.transaction.setTimeout(10);
        this.provider = provider;
        this.throttle = throttle;
        this.sessions = sessions;
        this.clock = clock;
        this.passwords = passwords;
        this.emails=emails;
    }

    public SessionCredentials login(String emailInput, String password, SessionTransport transport,
            String deviceLabel, String trustedSourceAddress) {
        LoginThrottle.requireNoTransaction();
        String email = LoginInput.email(emailInput);
        LoginInput.password(password);
        Objects.requireNonNull(transport);
        String label = SessionService.normalizeLabel(deviceLabel);
        UUID attempt = throttle.begin(email, trustedSourceAddress);
        if(emails!=null) { emails.reconcileBeforeLogin(email); }
        if(passwords!=null) { passwords.reconcileBeforeLogin(email); }
        var snapshots = jdbc.query("""
                SELECT a.id, a.security_epoch, a.credential_generation, p.tenant_id, p.provider_user_id
                FROM account_identity a JOIN managed_password_identity p ON p.account_id = a.id WHERE a.email = ?
                """, (row, index) -> new Snapshot(row.getObject("id", UUID.class), row.getLong("security_epoch"),
                        row.getLong("credential_generation"), new PasswordCredentialVerifier.Subject(
                                row.getObject("tenant_id", UUID.class), row.getObject("provider_user_id", UUID.class))), email);
        // Always verify, including unknown local emails, to avoid a local account-existence shortcut.
        var subject = provider.verify(email, password);
        try {
            if (snapshots.isEmpty() || subject.isEmpty() || !snapshots.getFirst().subject().equals(subject.get())) {
                throw new InvalidLogin();
            }
            Snapshot snapshot = snapshots.getFirst();
            return transaction.execute(status -> {
                var result = sessions.issue(new VerifiedPasswordProof(snapshot.id(), snapshot.epoch(),
                        snapshot.generation(), clock.instant()), transport, label);
                // issue holds the current account lock. Email/binding drift must roll back issuance AND eviction.
                if (jdbc.queryForObject("""
                        SELECT count(*) FROM account_identity a JOIN managed_password_identity p ON p.account_id = a.id
                        WHERE a.id = ? AND a.email = ? AND p.tenant_id = ? AND p.provider_user_id = ?
                        """, Integer.class, snapshot.id(), email, subject.get().tenantId(), subject.get().userId()) != 1) {
                    throw new InvalidLogin();
                }
                return result;
            });
        } catch (InvalidLogin | InvalidSession exception) {
            throttle.failed(attempt);
            throw new InvalidLogin();
        }
    }

    private record Snapshot(UUID id, long epoch, long generation, PasswordCredentialVerifier.Subject subject) { }

    public SessionCredentials reauthenticate(String token, SessionTransport transport, String csrfToken,
            String password, String trustedSourceAddress) {
        LoginThrottle.requireNoTransaction();
        LoginInput.password(password);
        Objects.requireNonNull(transport);
        ReauthenticationSnapshot snapshot = transaction.execute(status -> {
            var principal = sessions.authenticate(token, transport);
            if (transport == SessionTransport.BROWSER) { sessions.requireCsrf(token, csrfToken); }
            return jdbc.queryForObject("""
                    SELECT a.id, a.email, a.security_epoch, a.credential_generation, p.tenant_id, p.provider_user_id
                    FROM account_identity a LEFT JOIN managed_password_identity p ON p.account_id = a.id WHERE a.id = ?
                    """, (row, index) -> new ReauthenticationSnapshot(row.getObject("id", UUID.class),
                            row.getString("email"), row.getLong("security_epoch"), row.getLong("credential_generation"),
                            row.getObject("tenant_id", UUID.class) == null ? null : new PasswordCredentialVerifier.Subject(
                                    row.getObject("tenant_id", UUID.class), row.getObject("provider_user_id", UUID.class))),
                    principal.accountId());
        });
        throttle.admitApi(snapshot.id(), true);
        UUID attempt = throttle.begin(snapshot.email(), trustedSourceAddress);
        var subject = provider.verify(snapshot.email(), password);
        if (subject.isEmpty() || !subject.get().equals(snapshot.subject())) {
            throttle.failed(attempt);
            throw new InvalidLogin();
        }
        var proof = new VerifiedPasswordProof(snapshot.id(), snapshot.epoch(), snapshot.generation(), clock.instant());
        return transaction.execute(status -> {
            var principal = sessions.authenticate(token, transport);
            if (transport == SessionTransport.BROWSER) { sessions.requireCsrf(token, csrfToken); }
            if (!principal.accountId().equals(snapshot.id()) || jdbc.queryForObject("""
                    SELECT count(*) FROM account_identity a JOIN managed_password_identity p ON p.account_id = a.id
                    WHERE a.id = ? AND a.email = ? AND a.security_epoch = ? AND a.credential_generation = ?
                        AND p.tenant_id = ? AND p.provider_user_id = ?
                    """, Integer.class, snapshot.id(), snapshot.email(), snapshot.epoch(), snapshot.generation(),
                    subject.get().tenantId(), subject.get().userId()) != 1) {
                throw new InvalidSession();
            }
            return sessions.reauthenticate(token, transport, proof);
        });
    }

    private record ReauthenticationSnapshot(UUID id, String email, long epoch, long generation,
            PasswordCredentialVerifier.Subject subject) {
        @Override public String toString() { return "ReauthenticationSnapshot[redacted]"; }
    }
}
