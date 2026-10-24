package com.narudzbine.shared.infrastructure.recovery;

import java.time.Instant;
import java.time.format.DateTimeFormatterBuilder;
import java.util.UUID;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** Only non-content source identifiers belong in the authenticated, visible envelope header. */
public record BackupContext(int version, UUID backupId, String environment, String sourceReference,
        String sourceClusterId, int schemaVersion, String postgresVersion, String snapshotAt) {
    private static final JsonMapper JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
    public static byte[] canonical(byte[] supplied) {
        try {
            if (supplied == null || supplied.length > BackupEnvelope.MAX_METADATA) throw new IllegalArgumentException();
            var tree = JSON.readTree(supplied);
            if (!tree.isObject() || tree.size() != 8 || !tree.path("version").isInt() || !tree.path("schemaVersion").isInt()) throw new IllegalArgumentException();
            for (String name : java.util.List.of("backupId", "environment", "sourceReference", "sourceClusterId", "postgresVersion", "snapshotAt")) if (!tree.path(name).isString()) throw new IllegalArgumentException();
            BackupContext value = JSON.readValue(supplied, BackupContext.class);
            if (!value.backupId.toString().equals(tree.path("backupId").asString())) throw new IllegalArgumentException();
            if (value.version != 1 || value.backupId == null || value.backupId.version() != 7 || value.backupId.variant() != 2
                    || value.environment == null || !value.environment.matches("[A-Z][A-Z0-9_]{0,31}")
                    || value.sourceReference == null || !value.sourceReference.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
                    || value.sourceClusterId == null || !value.sourceClusterId.matches("[0-9]{1,20}")
                    || value.schemaVersion < 1 || value.schemaVersion > 1000000 || !"18.6".equals(value.postgresVersion)
                    || value.snapshotAt == null || !new DateTimeFormatterBuilder().appendInstant(3).toFormatter()
                        .format(Instant.parse(value.snapshotAt)).equals(value.snapshotAt)) throw new IllegalArgumentException();
            return JSON.writeValueAsBytes(value);
        } catch (RuntimeException failure) {
            throw new IllegalArgumentException("Explicit bounded backup source context required");
        }
    }
    @Override public String toString() { return "BackupContext[redacted]"; }
}
