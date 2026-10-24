package com.narudzbine.identity;

import java.util.ArrayList;
import java.util.Map;
import java.util.TreeMap;
import java.util.Set;
import java.nio.file.Files;
import java.nio.file.Path;
import java.io.IOException;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Local synthetic capacity infrastructure; never part of the shipping application. */
final class LocalLoadPostgresProfile {
    private LocalLoadPostgresProfile() {}

    private static final tools.jackson.databind.JsonNode PROFILE = readProfile();
    static final String ID = PROFILE.path("id").asString();
    static final long SHARED_MEMORY_BYTES = PROFILE.path("sharedMemoryBytes").asLong();
    private static final Map<String, String> SETTINGS = settings();

    private static tools.jackson.databind.JsonNode readProfile() {
        try {
            var profile = JsonMapper.builder().build().readTree(Files.readString(Path.of("operations", "local-load-postgres.json")));
            if (!profile.path("id").isString() || !profile.path("id").asString().matches("[a-z0-9][a-z0-9-]{1,100}")
                    || profile.path("minimumDockerMemoryBytes").asLong() < 8L * 1024 * 1024 * 1024
                    || profile.path("sharedMemoryBytes").asLong() < 64L * 1024 * 1024) {
                throw new IllegalStateException("Invalid versioned local database profile");
            }
            return profile;
        } catch (IOException failure) {
            throw new IllegalStateException("Versioned local database profile unavailable", failure);
        }
    }

    private static Map<String, String> settings() {
        var values = new TreeMap<String, String>();
        for (var entry : PROFILE.path("settings").properties()) {
            if (!entry.getValue().isString() || entry.getValue().asString().isBlank()) {
                throw new IllegalStateException("Invalid local database setting");
            }
            values.put(entry.getKey(), entry.getValue().asString());
        }
        var allowed = Set.of("fsync", "synchronous_commit", "full_page_writes", "wal_level", "shared_buffers", "wal_buffers",
            "max_wal_size", "min_wal_size", "checkpoint_timeout", "checkpoint_completion_target", "shared_preload_libraries",
            "pg_stat_statements.track", "pg_stat_statements.track_utility");
        if (!values.keySet().equals(allowed) || !"on".equals(values.get("fsync")) || !"on".equals(values.get("synchronous_commit"))
                || !"on".equals(values.get("full_page_writes")) || !"replica".equals(values.get("wal_level"))
                || !"pg_stat_statements".equals(values.get("shared_preload_libraries"))) {
            throw new IllegalStateException("Local database profile must preserve durability and bounded statistics configuration");
        }
        return Map.copyOf(values);
    }

    static String[] command() {
        var arguments = new ArrayList<String>();
        arguments.add("postgres");
        new TreeMap<>(SETTINGS).forEach((name, value) -> {
            arguments.add("-c");
            arguments.add(name + "=" + value);
        });
        return arguments.toArray(String[]::new);
    }

    static Map<String, Object> observe(JdbcTemplate jdbc) {
        var observed = new TreeMap<String, String>();
        new TreeMap<>(SETTINGS).forEach((name, expected) -> {
            String actual = jdbc.queryForObject("SELECT current_setting(?)", String.class, name);
            if (!expected.equals(actual)) {
                throw new IllegalStateException("Local load database profile mismatch: " + name);
            }
            observed.put(name, actual);
        });
        return Map.of("id", ID, "observedSettings", observed);
    }

    static Map<String, Object> statistics(JdbcTemplate jdbc) {
        return jdbc.queryForMap("""
            SELECT clock_timestamp()::text AS sampled_at,
              (SELECT wal_bytes::text FROM pg_stat_wal) AS wal_bytes,
              (SELECT wal_fpi FROM pg_stat_wal) AS wal_full_page_images,
              (SELECT wal_buffers_full FROM pg_stat_wal) AS wal_buffers_full,
              (SELECT num_timed FROM pg_stat_checkpointer) AS checkpoints_timed,
              (SELECT num_requested FROM pg_stat_checkpointer) AS checkpoints_requested,
              (SELECT write_time FROM pg_stat_checkpointer) AS checkpoint_write_ms,
              (SELECT sync_time FROM pg_stat_checkpointer) AS checkpoint_sync_ms
            """);
    }
}
