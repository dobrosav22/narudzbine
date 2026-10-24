package com.narudzbine.identity.application;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Purpose-bound short-lived delivery envelope; not a password store. */
public final class ResetDeliveryCipher {
    private final SecretKeySpec key;
    private final String purpose;
    public ResetDeliveryCipher(byte[] secret) {
        this(secret,"password-reset/v1");
    }
    ResetDeliveryCipher(byte[] secret,String purpose) {
        if (secret == null || secret.length != 32) { throw new IllegalArgumentException("A dedicated 256-bit reset delivery key is required."); }
        key = new SecretKeySpec(secret.clone(), "AES");
        this.purpose=purpose;
    }
    public byte[] encrypt(UUID proof, String token) {
        byte[] nonce = new byte[12]; new SecureRandom().nextBytes(nonce);
        byte[] encrypted = crypt(Cipher.ENCRYPT_MODE, proof, nonce, token.getBytes(StandardCharsets.US_ASCII));
        byte[] envelope = Arrays.copyOf(nonce, nonce.length + encrypted.length);
        System.arraycopy(encrypted, 0, envelope, nonce.length, encrypted.length);
        return envelope;
    }
    public String decrypt(UUID proof, byte[] envelope) {
        if (envelope == null || envelope.length < 29) { throw new IllegalArgumentException("Invalid reset envelope."); }
        return new String(crypt(Cipher.DECRYPT_MODE, proof, Arrays.copyOf(envelope,12),
                Arrays.copyOfRange(envelope,12,envelope.length)), StandardCharsets.US_ASCII);
    }
    private byte[] crypt(int mode, UUID proof, byte[] nonce, byte[] content) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(mode, key, new GCMParameterSpec(128,nonce));
            cipher.updateAAD((purpose+"/" + proof).getBytes(StandardCharsets.US_ASCII));
            return cipher.doFinal(content);
        } catch (GeneralSecurityException exception) { throw new IllegalArgumentException("Reset envelope unavailable."); }
    }
}
