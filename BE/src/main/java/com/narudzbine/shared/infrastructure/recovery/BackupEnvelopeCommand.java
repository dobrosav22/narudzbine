package com.narudzbine.shared.infrastructure.recovery;

import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.json.JsonMapper;

/** Binary-only transformation; never starts a server, opens a database or publishes an artifact. */
public final class BackupEnvelopeCommand {
    private BackupEnvelopeCommand() { }
    public static void run(String[] args, Map<String, String> environment, InputStream input, OutputStream output) {
        if (args.length != 2 || !args[0].equals("--backup-envelope") || !Set.of("encrypt", "decrypt").contains(args[1])) {
            throw new IllegalArgumentException("Expected --backup-envelope encrypt|decrypt");
        }
        byte[] key = null;
        try {
            if (!"true".equals(environment.get("BACKUP_ENVELOPE_ISOLATED_KEY_ACKNOWLEDGED"))) throw new IllegalArgumentException();
            String encoded = environment.getOrDefault("BACKUP_ENVELOPE_KEY", "");
            if (encoded.length() > 100) throw new IllegalArgumentException();
            key = Base64.getDecoder().decode(encoded); if (key.length != 32) throw new IllegalArgumentException();
            for (String name : List.of("PRIVACY_EXPORTS_ARTIFACT_KEY", "REPORTING_EXPORTS_ARTIFACT_KEY", "PRIVACY_EXPORT_ARTIFACT_KEY", "REPORTING_EXPORT_ARTIFACT_KEY")) {
                String value = environment.getOrDefault(name, "");
                if (!value.isBlank() && MessageDigest.isEqual(key, Base64.getDecoder().decode(value))) throw new IllegalArgumentException();
            }
            var json = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
            for (String name : List.of("REDACTION_WORKER_KEY_RING", "AUDIT_ARCHIVE_KEY_RING")) {
                String value = environment.getOrDefault(name, ""); if (value.isBlank()) continue;
                if (value.length() > 4096) throw new IllegalArgumentException();
                var ring = json.readTree(value); if (!ring.isObject() || ring.size() < 1 || ring.size() > 32) throw new IllegalArgumentException();
                for (var item : ring.properties()) {
                    if (!item.getValue().isString() || MessageDigest.isEqual(key, Base64.getDecoder().decode(item.getValue().asString()))) throw new IllegalArgumentException();
                }
            }
            String context = environment.getOrDefault("BACKUP_ENVELOPE_CONTEXT", ""); if (context.length() > 8192) throw new IllegalArgumentException();
            byte[] metadata = BackupContext.canonical(Base64.getDecoder().decode(context));
            var envelope = new BackupEnvelope();
            if (args[1].equals("encrypt")) envelope.encrypt(input, output, key, metadata);
            else envelope.decrypt(input, output, key, metadata);
        } catch (IOException | RuntimeException failure) {
            throw new IllegalStateException("Backup envelope command did not complete; no restore/publication is authorized");
        } finally { if (key != null) Arrays.fill(key, (byte) 0); }
    }
}
