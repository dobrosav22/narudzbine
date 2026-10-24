package com.narudzbine.identity.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class ExternalSecrets {
    private final ResetDeliveryCipher cipher;
    public ExternalSecrets(byte[] key) { cipher=new ResetDeliveryCipher(key,"external-flow/v1"); }
    public byte[] encrypt(UUID flow,String verifier) { return cipher.encrypt(flow,verifier); }
    public String decrypt(UUID flow,byte[] envelope) { return cipher.decrypt(flow,envelope); }
    public static String challenge(String value) {
        try { return Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII))); }
        catch(java.security.GeneralSecurityException e) { throw new IllegalStateException("PKCE hashing unavailable."); }
    }
    public static String nonce(String verifier) {
        try {
            var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(verifier.getBytes(StandardCharsets.US_ASCII),"HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal("external-oidc-nonce/v1".getBytes(StandardCharsets.US_ASCII)));
        } catch(java.security.GeneralSecurityException e) { throw new IllegalStateException("Nonce generation unavailable."); }
    }
    public static void verifier(String value) { if(value==null || !value.matches("[A-Za-z0-9._~-]{43,128}")) { throw new IllegalArgumentException("Invalid PKCE verifier."); } }
}
