package com.narudzbine.shared.api;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class ResourceRevisions {
    private final byte[] key;

    public ResourceRevisions(byte[] key) {
        if (key.length < 32) { throw new IllegalArgumentException("A revision key of at least32 bytes is required."); }
        this.key = key.clone();
    }

    public String encode(String domain, UUID id, long revision) {
        if (!domain.matches("[a-z]+/v[1-9][0-9]*")) { throw new IllegalArgumentException("Invalid revision domain."); }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(
                    (domain + "/" + id + "/" + revision).getBytes(StandardCharsets.US_ASCII)));
        } catch (java.security.GeneralSecurityException exception) { throw new IllegalStateException("Revision signing unavailable."); }
    }

    public boolean matches(String domain, UUID id, long revision, String submitted) {
        return submitted != null && MessageDigest.isEqual(encode(domain, id, revision).getBytes(StandardCharsets.US_ASCII),
                submitted.getBytes(StandardCharsets.UTF_8));
    }
}
