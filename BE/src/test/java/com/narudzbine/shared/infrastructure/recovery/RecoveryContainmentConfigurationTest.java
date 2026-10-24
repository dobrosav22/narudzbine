package com.narudzbine.shared.infrastructure.recovery;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.api.RecoveryContainment;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.*;

class RecoveryContainmentConfigurationTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(RecoveryContainmentConfiguration.class, RecoveryContainmentHealthIndicator.class);
    static final AtomicBoolean STARTED = new AtomicBoolean();
    @Configuration(proxyBeanMethods = false)
    static class OrdinaryFeature {
        @Bean Object ordinaryFeature() { STARTED.set(true); return new Object(); }
    }
    @Test void modeIsVisibleToPrivateHealthWithoutPretendingReadiness() {
        context.withPropertyValues("operations.recovery.contained=true").run(c -> {
            assertThat(c).hasNotFailed();
            assertThat(c.getBean(RecoveryContainment.class).contained()).isTrue();
            assertThat(c.getBean(RecoveryContainmentHealthIndicator.class).health().getStatus().getCode()).isEqualTo("DOWN");
        });
        context.run(c -> assertThat(c.getBean(RecoveryContainmentHealthIndicator.class).health().getStatus().getCode()).isEqualTo("UP"));
    }
    @Test void forbiddenConfigurationFailsBeforeOrdinaryBeansAreInstantiated() {
        STARTED.set(false);
        context.withUserConfiguration(OrdinaryFeature.class)
                .withPropertyValues("operations.recovery.contained=true", "identity.provider.enabled=true")
                .run(c -> { assertThat(c).hasFailed(); assertThat(STARTED).isFalse(); });
    }
}
