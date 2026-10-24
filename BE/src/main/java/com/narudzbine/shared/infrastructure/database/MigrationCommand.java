package com.narudzbine.shared.infrastructure.database;

import java.util.Map;
import org.flywaydb.core.Flyway;

/** Explicit release command; never invoked by ordinary server startup. */
public final class MigrationCommand {
    private MigrationCommand() {
    }

    public static void run(Map<String, String> environment) {
        migrate(required(environment, "DATABASE_URL"),
                required(environment, "MIGRATION_DATABASE_USERNAME"),
                required(environment, "MIGRATION_DATABASE_PASSWORD"));
    }

    public static void migrate(String url, String username, String password) {
        Flyway.configure().dataSource(url, username, password)
                .locations("classpath:db/migration").cleanDisabled(true)
                .baselineOnMigrate(false).validateOnMigrate(true).lockRetryCount(10)
                .load().migrate();
    }

    private static String required(Map<String, String> environment, String name) {
        String value = environment.get(name);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Required migration configuration is missing: " + name);
        }
        return value;
    }
}
