package com.narudzbine.identity.application;

import com.narudzbine.identity.api.InvalidCsrf;
import com.narudzbine.identity.api.InvalidSession;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public final class PreAuthService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final LoginThrottle throttle;
    private final Clock clock;

    public PreAuthService(JdbcTemplate jdbc, PlatformTransactionManager manager, LoginThrottle throttle, Clock clock) {
        this.jdbc = jdbc;
        transaction = new TransactionTemplate(manager);
        transaction.setTimeout(10);
        this.throttle = throttle;
        this.clock = clock;
    }

    public Bootstrap create(String trustedSource) {
        LoginThrottle.requireNoTransaction();
        throttle.beginBootstrap(trustedSource);
        String nonce = SessionSecrets.generate();
        String binding = SessionSecrets.generate();
        Instant expires = clock.instant().truncatedTo(ChronoUnit.MILLIS).plusSeconds(300);
        transaction.executeWithoutResult(status -> jdbc.update(
                "INSERT INTO pre_auth_nonce(nonce_hash, binding_hash, expires_at) VALUES (?, ?, ?)",
                SessionSecrets.hash(nonce), SessionSecrets.hash(binding), Timestamp.from(expires)));
        return new Bootstrap(nonce, binding, expires);
    }

    public void consume(String nonce, String binding) {
        LoginThrottle.requireNoTransaction();
        try {
            byte[] nonceHash = SessionSecrets.hash(nonce);
            byte[] bindingHash = SessionSecrets.hash(binding);
            transaction.executeWithoutResult(status -> {
                var rows = jdbc.query("""
                        SELECT binding_hash FROM pre_auth_nonce WHERE nonce_hash = ? AND consumed_at IS NULL
                        AND expires_at > ? FOR UPDATE
                        """, (row, index) -> row.getBytes(1), nonceHash, Timestamp.from(clock.instant()));
                if (rows.isEmpty() || !MessageDigest.isEqual(rows.getFirst(), bindingHash)) { throw new InvalidCsrf(); }
                jdbc.update("UPDATE pre_auth_nonce SET consumed_at = ? WHERE nonce_hash = ?",
                        Timestamp.from(clock.instant()), nonceHash);
            });
        } catch (InvalidSession exception) { throw new InvalidCsrf(); }
    }

    public void cleanup() {
        transaction.executeWithoutResult(status -> {
            jdbc.update("""
                    DELETE FROM pre_auth_nonce WHERE nonce_hash IN
                    (SELECT nonce_hash FROM pre_auth_nonce WHERE expires_at <= ? ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED)
                    """, Timestamp.from(clock.instant()));
            jdbc.update("""
                    DELETE FROM login_attempt WHERE id IN
                    (SELECT id FROM login_attempt WHERE attempted_at < ? ORDER BY attempted_at LIMIT 1000 FOR UPDATE SKIP LOCKED)
                    """, Timestamp.from(clock.instant().minusSeconds(86400)));
            jdbc.update("""
                    DELETE FROM login_throttle_bucket b WHERE key_hash IN
                    (SELECT key_hash FROM login_throttle_bucket k WHERE blocked_until < ?
                    AND NOT EXISTS (SELECT 1 FROM login_attempt a WHERE a.email_key = k.key_hash OR a.source_key = k.key_hash)
                    LIMIT 1000 FOR UPDATE SKIP LOCKED)
                    """, Timestamp.from(clock.instant()));
        });
    }

    public record Bootstrap(String nonce, String binding, Instant expiresAt) {
        @Override public String toString() { return "Bootstrap[redacted]"; }
    }
}
