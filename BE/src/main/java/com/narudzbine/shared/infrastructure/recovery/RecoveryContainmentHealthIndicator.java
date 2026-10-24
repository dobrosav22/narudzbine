package com.narudzbine.shared.infrastructure.recovery;

import com.narudzbine.shared.api.RecoveryContainment;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

@Component("recoveryContainment")
public final class RecoveryContainmentHealthIndicator implements HealthIndicator {
    private final RecoveryContainment state;
    public RecoveryContainmentHealthIndicator(RecoveryContainment state) { this.state = state; }
    @Override public Health health() {
        return state.contained() ? Health.down().withDetail("reason", "RECOVERY_CONTAINED").build() : Health.up().build();
    }
}
