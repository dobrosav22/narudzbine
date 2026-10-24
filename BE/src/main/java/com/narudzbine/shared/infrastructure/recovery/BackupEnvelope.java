package com.narudzbine.shared.infrastructure.recovery;

import java.io.*;
import java.nio.ByteBuffer;
import java.security.*;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Bounded standard AES-256-GCM envelope. Callers publish only after upstream and encryption success. */
public final class BackupEnvelope {
    public static final int MAX_PLAINTEXT = 128 * 1024 * 1024;
    public static final int MAX_METADATA = 4096;
    private static final byte[] MAGIC = new byte[]{'N','A','R','B','A','K',1,0};
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BYTES = 16;
    private final SecureRandom random;
    public BackupEnvelope() { this(new SecureRandom()); }
    BackupEnvelope(SecureRandom random) { this.random = random; }

    public void encrypt(InputStream plaintext, OutputStream ciphertext, byte[] key, byte[] metadata) throws IOException {
        validate(key, metadata);
        byte[] nonce = new byte[NONCE_BYTES]; random.nextBytes(nonce);
        byte[] header = ByteBuffer.allocate(MAGIC.length + Integer.BYTES + metadata.length + NONCE_BYTES)
                .put(MAGIC).putInt(metadata.length).put(metadata).put(nonce).array();
        byte[] buffer = new byte[65536];
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(header);
            ciphertext.write(header);
            long total = 0;
            for (int read; (read = plaintext.read(buffer)) != -1;) {
                if (read == 0) continue;
                total += read;
                if (total > MAX_PLAINTEXT) throw new IOException("Backup exceeds the documented envelope bound");
                byte[] encrypted = cipher.update(buffer, 0, read);
                if (encrypted != null) ciphertext.write(encrypted);
            }
            ciphertext.write(cipher.doFinal());
            ciphertext.flush();
        } catch (GeneralSecurityException failure) {
            throw new IOException("Backup envelope encryption failed");
        } finally { Arrays.fill(buffer, (byte) 0); }
    }

    /** Authenticate the complete bounded artifact before releasing any plaintext to a restore process. */
    public void decrypt(InputStream ciphertext, OutputStream plaintext, byte[] key, byte[] expectedMetadata) throws IOException {
        validate(key, expectedMetadata);
        int bound = MAX_PLAINTEXT + MAGIC.length + Integer.BYTES + MAX_METADATA + NONCE_BYTES + TAG_BYTES;
        byte[] encoded = ciphertext.readNBytes(bound + 1);
        if (encoded.length > bound || encoded.length < MAGIC.length + Integer.BYTES + NONCE_BYTES + TAG_BYTES) {
            throw new IOException("Invalid bounded backup envelope");
        }
        byte[] result = null;
        try {
            ByteBuffer fields = ByteBuffer.wrap(encoded);
            byte[] magic = new byte[MAGIC.length]; fields.get(magic);
            int length = fields.getInt();
            if (!Arrays.equals(magic, MAGIC) || length < 0 || length > MAX_METADATA
                    || fields.remaining() < length + NONCE_BYTES + TAG_BYTES) throw new IOException("Invalid backup envelope header");
            byte[] metadata = new byte[length]; fields.get(metadata);
            if (!Arrays.equals(metadata, expectedMetadata)) throw new IOException("Backup context does not match the expected source");
            byte[] nonce = new byte[NONCE_BYTES]; fields.get(nonce);
            int headerLength = fields.position();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(encoded, 0, headerLength);
            result = cipher.doFinal(encoded, headerLength, encoded.length - headerLength);
            if (result.length > MAX_PLAINTEXT) throw new IOException("Backup exceeds the documented envelope bound");
            plaintext.write(result);
            plaintext.flush();
        } catch (GeneralSecurityException | java.nio.BufferUnderflowException failure) {
            throw new IOException("Backup authenticated envelope verification failed");
        } finally {
            if (result != null) Arrays.fill(result, (byte) 0);
        }
    }

    private static void validate(byte[] key, byte[] metadata) throws IOException {
        if (key == null || key.length != 32 || metadata == null || metadata.length > MAX_METADATA) {
            throw new IOException("Explicit isolated backup key and bounded context required");
        }
    }
}
