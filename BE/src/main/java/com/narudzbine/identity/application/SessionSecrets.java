package com.narudzbine.identity.application;

import com.narudzbine.identity.api.InvalidSession;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class SessionSecrets {
    private static final SecureRandom RANDOM = new SecureRandom();

    private SessionSecrets() {
    }

    static String generate() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String csrf(String secret) {
        hash(secret);
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(Base64.getUrlDecoder().decode(secret), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                    mac.doFinal("narudzbine/session-csrf/v1".getBytes(StandardCharsets.US_ASCII)));
        } catch (java.security.GeneralSecurityException exception) {
            throw new IllegalStateException("Required HMAC implementation is unavailable.");
        }
    }

    static byte[] hash(String secret) {
        if (secret == null || !secret.matches("[A-Za-z0-9_-]{43}")) {
            throw new InvalidSession();
        }
        try {
            return MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.US_ASCII));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Required SHA-256 implementation is unavailable.");
        }
    }
}
