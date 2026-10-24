package com.narudzbine.identity.application;

import com.narudzbine.identity.api.LoginThrottled;
import com.narudzbine.shared.api.UuidGenerator;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Durable admission and failure accounting; never hold a transaction over a provider call. */
public final class LoginThrottle {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final Clock clock;
    private final UuidGenerator ids;
    private final SecretKeySpec key;

    public LoginThrottle(JdbcTemplate jdbc, Clock clock,
            UuidGenerator ids, byte[] secret) {
        if (secret == null || secret.length < 32) {
            throw new IllegalArgumentException("A dedicated throttle key of at least 32 bytes is required.");
        }
        this.jdbc = jdbc;
        // Admission is independent SQL work; no entity state participates in its savepoints.
        this.transaction = new TransactionTemplate(new JdbcTransactionManager(
                java.util.Objects.requireNonNull(jdbc.getDataSource(), "A JDBC data source is required.")));
        this.transaction.setTimeout(10);
        this.clock = clock;
        this.ids = ids;
        this.key = new SecretKeySpec(secret.clone(), "HmacSHA256");
    }

    public UUID begin(String normalizedEmail, String trustedSourceAddress) {
        return begin(normalizedEmail, trustedSourceAddress, "source", 30, 900);
    }

    public UUID beginBootstrap(String trustedSourceAddress) {
        return begin("pre-auth-bootstrap", trustedSourceAddress, "bootstrap-source", 30, 900);
    }

    public void admitSetup(String source) {begin("public-setup",source,"setup-source",20,900);}
    public void admitUpload(UUID vendor){begin("media-upload/"+vendor,vendor.toString(),"media-upload-vendor",30,3600);}
    public void admitImport(UUID vendor){begin("csv-import/"+vendor,vendor.toString(),"csv-import-vendor",3,3600);}
    public void admitApi(UUID account, boolean write) {
        if (!write) {
            begin("api/" + account, account.toString(), "api-account", 120, 60);
            return;
        }
        requireNoTransaction();
        byte[] email = hash("email", "api/" + account);
        byte[] source = hash("api-account", account.toString());
        byte[] writeEmail = hash("email", "api-write/" + account);
        byte[] writeSource = hash("api-write-account", account.toString());
        RuntimeException rejected = transaction.execute(status -> {
            // Preserve one global ordering even when a counter key is shared with another path.
            lockAll(email, source, writeEmail, writeSource);
            recordLockedAttempt(email, source, 120, 60);
            Object savepoint = status.createSavepoint();
            try {
                recordLockedAttempt(writeEmail, writeSource, 60, 60);
                return null;
            } catch (RuntimeException failure) {
                // Preserve general admission exactly as the former first committed transaction did.
                status.rollbackToSavepoint(savepoint);
                return failure;
            } finally {
                status.releaseSavepoint(savepoint);
            }
        });
        if (rejected != null) {
            throw rejected;
        }
    }

    public void admitLogout(String trustedSourceAddress) {
        begin("logout", trustedSourceAddress, "logout-source", 120, 60);
    }

    /** Source allowance includes address-throttled and unknown requests; address suppression remains private. */
    public boolean admitPasswordReset(String normalizedEmail, String trustedSourceAddress) {
        requireNoTransaction();
        if (trustedSourceAddress == null || trustedSourceAddress.isBlank() || trustedSourceAddress.length()>128) {
            throw new IllegalArgumentException("A trusted source address is required.");
        }
        byte[] email=hash("reset-email",normalizedEmail), source=hash("reset-source",trustedSourceAddress);
        return transaction.execute(status -> {
            if(Arrays.compareUnsigned(email,source)<0) { lock(email);lock(source); } else { lock(source);lock(email); }
            Instant now=now();
            var attempts=jdbc.query("SELECT attempted_at FROM login_attempt WHERE source_key=? AND attempted_at>? ORDER BY attempted_at,id",
                    (r,n)->r.getTimestamp(1).toInstant(),source,time(now.minusSeconds(3600)));
            if(attempts.size()>=20) { throw throttled(now,attempts.getFirst().plusSeconds(3600)); }
            int addressCount=jdbc.queryForObject("SELECT count(*) FROM login_attempt WHERE email_key=? AND attempted_at>?",
                    Integer.class,email,time(now.minusSeconds(3600)));
            jdbc.update("INSERT INTO login_attempt(id,email_key,source_key,attempted_at) VALUES (?,?,?,?)",ids.next(),email,source,time(now));
            return addressCount<3;
        });
    }

    private UUID begin(String normalizedEmail, String trustedSourceAddress, String sourceScope, int limit, int window) {
        requireNoTransaction();
        if (trustedSourceAddress == null || trustedSourceAddress.isBlank() || trustedSourceAddress.length() > 128) {
            throw new IllegalArgumentException("A trusted source address is required.");
        }
        byte[] email = hash("email", normalizedEmail);
        byte[] source = hash(sourceScope, trustedSourceAddress);
        return transaction.execute(status -> recordAttempt(email, source, limit, window));
    }

    private UUID recordAttempt(byte[] email, byte[] source, int limit, int window) {
        lockAll(email, source);
        return recordLockedAttempt(email, source, limit, window);
    }

    private UUID recordLockedAttempt(byte[] email, byte[] source, int limit, int window) {
        Instant now = now();
        var state = jdbc.queryForObject("""
                SELECT b.blocked_until,a.attempts,a.first_attempt FROM login_throttle_bucket b
                CROSS JOIN LATERAL (
                  SELECT count(*) AS attempts,min(attempted_at) AS first_attempt FROM login_attempt
                  WHERE source_key=? AND attempted_at>?
                ) a WHERE b.key_hash=?
                """, (row, index) -> {
                    Timestamp blocked = row.getTimestamp("blocked_until");
                    Timestamp first = row.getTimestamp("first_attempt");
                    return new AttemptWindow(blocked == null ? null : blocked.toInstant(),
                            row.getLong("attempts"), first == null ? null : first.toInstant());
                }, source, time(now.minusSeconds(window)), email);
        if (state.blockedUntil() != null && state.blockedUntil().isAfter(now)) {
            throw throttled(now, state.blockedUntil());
        }
        if (state.attempts() >= limit) {
            throw throttled(now, state.firstAttempt().plusSeconds(window));
        }
        UUID id = ids.next();
        jdbc.update("INSERT INTO login_attempt(id, email_key, source_key, attempted_at) VALUES (?, ?, ?, ?)",
                id, email, source, time(now));
        return id;
    }

    private record AttemptWindow(Instant blockedUntil, long attempts, Instant firstAttempt) {}

    public void failed(UUID attempt) {
        requireNoTransaction();
        transaction.executeWithoutResult(status -> {
            var keys = jdbc.query("SELECT email_key FROM login_attempt WHERE id = ?", (row, index) -> row.getBytes(1), attempt);
            if (keys.isEmpty()) {
                throw new IllegalArgumentException("Unknown login attempt.");
            }
            byte[] email = keys.getFirst();
            lock(email);
            if (jdbc.update("UPDATE login_attempt SET failed = true WHERE id = ? AND NOT failed", attempt) == 0) {
                return;
            }
            Instant now = now();
            int failures = jdbc.queryForObject("""
                    SELECT count(*) FROM login_attempt WHERE email_key = ? AND failed AND attempted_at > ?
                    """, Integer.class, email, time(now.minusSeconds(900)));
            if (failures >= 5) {
                long seconds = Math.min(30, 1L << Math.min(5, failures - 5));
                jdbc.update("UPDATE login_throttle_bucket SET blocked_until = GREATEST(blocked_until, ?) WHERE key_hash = ?",
                        time(now.plusSeconds(seconds)), email);
            }
        });
    }

    private void lock(byte[] hash) {
        jdbc.update("INSERT INTO login_throttle_bucket(key_hash) VALUES (?) ON CONFLICT DO NOTHING", hash);
        jdbc.queryForObject("SELECT key_hash FROM login_throttle_bucket WHERE key_hash = ? FOR UPDATE", byte[].class, hash);
    }

    private void lockAll(byte[]... hashes) {
        var ordered = new java.util.TreeSet<byte[]>(Arrays::compareUnsigned);
        java.util.Collections.addAll(ordered, hashes);
        Object[] parameters = ordered.toArray();
        String values = String.join(",", java.util.Collections.nCopies(ordered.size(), "(?)"));
        jdbc.update("INSERT INTO login_throttle_bucket(key_hash) SELECT key_hash FROM (VALUES " + values
                + ") requested(key_hash) WHERE true ORDER BY key_hash ON CONFLICT DO NOTHING", parameters);
        String slots = String.join(",", java.util.Collections.nCopies(ordered.size(), "?"));
        var locked = jdbc.query("SELECT key_hash FROM login_throttle_bucket WHERE key_hash IN (" + slots
                + ") ORDER BY key_hash FOR UPDATE", (row, index) -> row.getBytes(1), parameters);
        if (locked.size() != ordered.size()) {
            throw new org.springframework.dao.CannotAcquireLockException("Admission counters unavailable.");
        }
    }

    private byte[] hash(String scope, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            return mac.doFinal((scope + "\u0000" + value).getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Throttle hashing unavailable.");
        }
    }

    static void requireNoTransaction() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("Login requires an independent transaction boundary.");
        }
    }

    private static LoginThrottled throttled(Instant now, Instant until) {
        return new LoginThrottled(Math.max(1, (Duration.between(now, until).toMillis() + 999) / 1000));
    }

    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
    private static Timestamp time(Instant value) { return Timestamp.from(value); }
}
