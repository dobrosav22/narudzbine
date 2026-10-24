package com.narudzbine.shared.infrastructure.recovery;

import static org.assertj.core.api.Assertions.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;

class BackupEnvelopeTest {
    final BackupEnvelope envelope = new BackupEnvelope();
    final byte[] key = new byte[32], context = "SYNTHETIC-CONTEXT".getBytes(StandardCharsets.UTF_8);
    byte[] encrypted(byte[] plain) throws IOException { var out = new ByteArrayOutputStream(); envelope.encrypt(new ByteArrayInputStream(plain), out, key, context); return out.toByteArray(); }
    @Test void standardEnvelopePreservesBinaryAndEmptyInputsWithFreshNonces() throws Exception {
        byte[] plain = new byte[8192]; new Random(7).nextBytes(plain);
        for (byte[] value : List.of(plain, new byte[0])) {
            byte[] first = encrypted(value), second = encrypted(value); assertThat(first).isNotEqualTo(second);
            var out = new ByteArrayOutputStream(); envelope.decrypt(new ByteArrayInputStream(first), out, key, context); assertThat(out.toByteArray()).isEqualTo(value);
        }
    }
    @Test void tamperedHeaderNonceCiphertextAndTagNeverReleasePlaintext() throws Exception {
        byte[] original = encrypted("PRIVATE-SYNTHETIC-DUMP".getBytes(StandardCharsets.UTF_8));
        for (int position : List.of(0, 8, 12, 12 + context.length, original.length - 17, original.length - 1)) {
            byte[] changed = original.clone(); changed[position] ^= 1; var out = new ByteArrayOutputStream();
            assertThatThrownBy(() -> envelope.decrypt(new ByteArrayInputStream(changed), out, key, context)).isInstanceOf(IOException.class); assertThat(out.size()).isZero();
        }
    }
    @Test void wrongContextKeyAndTruncationFailBeforeAnyRestoreBytes() throws Exception {
        byte[] original = encrypted(new byte[100]);
        for (String mode : List.of("key", "context", "truncated", "empty")) {
            byte[] candidate = mode.equals("truncated") ? Arrays.copyOf(original, original.length - 1) : mode.equals("empty") ? new byte[0] : original;
            byte[] selectedKey = key.clone(); if (mode.equals("key")) selectedKey[0] = 1;
            byte[] selectedContext = mode.equals("context") ? new byte[0] : context; var out = new ByteArrayOutputStream();
            assertThatThrownBy(() -> envelope.decrypt(new ByteArrayInputStream(candidate), out, selectedKey, selectedContext)).isInstanceOf(IOException.class); assertThat(out.size()).isZero();
        }
        byte[] forged = original.clone(); forged[12] ^= 1; byte[] forgedContext = context.clone(); forgedContext[0] ^= 1; var out = new ByteArrayOutputStream();
        assertThatThrownBy(() -> envelope.decrypt(new ByteArrayInputStream(forged), out, key, forgedContext)).isInstanceOf(IOException.class); assertThat(out.size()).isZero();
    }
    @Test void malformedDeclaredLengthAndInvalidSettingsAreBounded() throws Exception {
        byte[] original = encrypted(new byte[0]); ByteBuffer.wrap(original, 8, 4).putInt(Integer.MAX_VALUE); var out = new ByteArrayOutputStream();
        assertThatThrownBy(() -> envelope.decrypt(new ByteArrayInputStream(original), out, key, context)).isInstanceOf(IOException.class); assertThat(out.size()).isZero();
        InputStream forbidden = new InputStream() { @Override public int read() { throw new AssertionError("Invalid configuration must not consume a dump"); } };
        assertThatThrownBy(() -> envelope.encrypt(forbidden, out, new byte[16], context)).isInstanceOf(IOException.class);
        assertThatThrownBy(() -> envelope.encrypt(forbidden, out, key, new byte[BackupEnvelope.MAX_METADATA + 1])).isInstanceOf(IOException.class);
    }
    @Test void actualOversizeStreamFailsInsteadOfPublishingATruncatedSuccess() {
        InputStream oversized = new InputStream() {
            long remaining = (long) BackupEnvelope.MAX_PLAINTEXT + 1;
            @Override public int read() { if (remaining == 0) return -1; remaining--; return 0; }
            @Override public int read(byte[] bytes, int offset, int length) { if (remaining == 0) return -1; int n = (int)Math.min(remaining, length); Arrays.fill(bytes, offset, offset + n, (byte)0); remaining -= n; return n; }
        };
        assertThatThrownBy(() -> envelope.encrypt(oversized, OutputStream.nullOutputStream(), key, context)).isInstanceOf(IOException.class).hasMessage("Backup exceeds the documented envelope bound");
    }
}
