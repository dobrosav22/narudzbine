package com.narudzbine.shared.infrastructure.recovery;

import static org.assertj.core.api.Assertions.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;

class BackupEnvelopeCommandTest {
    static final String CONTEXT = "{\"version\":1,\"backupId\":\"019a0b00-0000-7000-8000-000000000001\",\"environment\":\"SYNTHETIC\",\"sourceReference\":\"local-source\",\"sourceClusterId\":\"123456789\",\"schemaVersion\":78,\"postgresVersion\":\"18.6\",\"snapshotAt\":\"2026-10-23T00:00:00.000Z\"}";
    Map<String,String> valid() { return new HashMap<>(Map.of("BACKUP_ENVELOPE_ISOLATED_KEY_ACKNOWLEDGED", "true", "BACKUP_ENVELOPE_KEY", Base64.getEncoder().encodeToString(new byte[32]), "BACKUP_ENVELOPE_CONTEXT", Base64.getEncoder().encodeToString(CONTEXT.getBytes(StandardCharsets.UTF_8)))); }
    @Test void binaryOnlyCommandRoundTripAndStrictArguments() {
        var encrypted = new ByteArrayOutputStream(); BackupEnvelopeCommand.run(new String[]{"--backup-envelope", "encrypt"}, valid(), new ByteArrayInputStream(new byte[]{0,1,2,(byte)255}), encrypted);
        assertThat(encrypted.toByteArray()).startsWith((byte)'N',(byte)'A',(byte)'R',(byte)'B'); var restored = new ByteArrayOutputStream(); BackupEnvelopeCommand.run(new String[]{"--backup-envelope", "decrypt"}, valid(), new ByteArrayInputStream(encrypted.toByteArray()), restored); assertThat(restored.toByteArray()).containsExactly(0,1,2,(byte)255);
        for (String[] args : List.of(new String[]{"--backup-envelope"},new String[]{"--backup-envelope-invalid","encrypt"},new String[]{"--backup-envelope","unknown"})) assertThatThrownBy(() -> BackupEnvelopeCommand.run(args,valid(),InputStream.nullInputStream(),OutputStream.nullOutputStream())).isInstanceOf(IllegalArgumentException.class).hasMessage("Expected --backup-envelope encrypt|decrypt");
    }
    @Test void sourceContextRejectsExtraDuplicateCoercedAndNonCanonicalDataWithoutExcerpts() {
        for (String supplied : List.of(CONTEXT.replace("\"version\":1", "\"version\":\"1\""), CONTEXT.replace("\"version\":1", "\"version\":1,\"version\":1"), CONTEXT.replace("{", "{\"private\":\"PRIVATE-CONTEXT\","), CONTEXT.replace(".000Z", "Z"), CONTEXT.replace("local-source", "https://private.example/secret"))) assertThatThrownBy(() -> BackupContext.canonical(supplied.getBytes(StandardCharsets.UTF_8))).hasMessage("Explicit bounded backup source context required").hasNoCause();
    }
    @Test void missingAcknowledgementAndKnownPurposeKeyReuseFailBeforeInputAndOutput() {
        for (String property : List.of("BACKUP_ENVELOPE_ISOLATED_KEY_ACKNOWLEDGED", "PRIVACY_EXPORTS_ARTIFACT_KEY", "REPORTING_EXPORTS_ARTIFACT_KEY", "REDACTION_WORKER_KEY_RING", "AUDIT_ARCHIVE_KEY_RING")) {
            var env = valid(); env.put(property, property.endsWith("KEY_RING") ? "{\"v1\":\"" + env.get("BACKUP_ENVELOPE_KEY") + "\"}" : property.endsWith("ACKNOWLEDGED") ? "false" : env.get("BACKUP_ENVELOPE_KEY"));
            var out = new ByteArrayOutputStream(); InputStream forbidden = new InputStream() { @Override public int read() { throw new AssertionError("Rejected key purpose must not consume source input"); } };
            assertThatThrownBy(() -> BackupEnvelopeCommand.run(new String[]{"--backup-envelope","encrypt"},env,forbidden,out)).isInstanceOf(IllegalStateException.class).hasMessage("Backup envelope command did not complete; no restore/publication is authorized").hasNoCause(); assertThat(out.size()).isZero();
        }
    }
}
