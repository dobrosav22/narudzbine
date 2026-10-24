package com.narudzbine.shared.infrastructure.database;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.stereotype.Component;

@Component
public final class DatabaseReadiness {
    private static final int EXPECTED_SCHEMA_VERSION = 78;
    private final DataSource dataSource;

    public DatabaseReadiness(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public void verifySchema() {
        try (Connection connection = dataSource.getConnection();
                var statement = connection.createStatement()) {
            statement.setQueryTimeout(5);
            try (ResultSet row = statement.executeQuery("SELECT version FROM backend_schema_version WHERE id = 1")) {
                if (!row.next() || row.getInt(1) != EXPECTED_SCHEMA_VERSION || row.next()) {
                    throw new IllegalStateException("Database schema is incompatible with this application.");
                }
            }
            if (connection.getMetaData().getDatabaseMajorVersion() != 18
                    || connection.getMetaData().getDatabaseMinorVersion() != 6) {
                throw new IllegalStateException("The verified PostgreSQL 18.6 baseline is required.");
            }
        } catch (SQLException exception) {
            // Do not attach driver exceptions that might contain connection details.
            throw new IllegalStateException("Database readiness verification failed.");
        }
        var flyway = Flyway.configure().dataSource(dataSource).cleanDisabled(true)
                .locations("classpath:db/migration").load();
        flyway.validate();
        if (flyway.info().pending().length != 0) {
            throw new IllegalStateException("Controlled release migrations must complete before startup.");
        }
    }

    public boolean isAvailable() {
        try (Connection connection = dataSource.getConnection();
                var statement = connection.createStatement()) {
            statement.setQueryTimeout(2);
            try (ResultSet row = statement.executeQuery("SELECT version FROM backend_schema_version WHERE id = 1")) {
                return row.next() && row.getInt(1) == EXPECTED_SCHEMA_VERSION;
            }
        } catch (SQLException exception) {
            return false;
        }
    }
}
