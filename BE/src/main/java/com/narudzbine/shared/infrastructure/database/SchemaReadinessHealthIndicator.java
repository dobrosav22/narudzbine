package com.narudzbine.shared.infrastructure.database;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

@Component("schemaReadiness")
public final class SchemaReadinessHealthIndicator implements HealthIndicator {
    private final DatabaseReadiness readiness;

    public SchemaReadinessHealthIndicator(DatabaseReadiness readiness) {
        this.readiness = readiness;
    }

    @Override
    public Health health() {
        return readiness.isAvailable() ? Health.up().build() : Health.down().build();
    }
}
