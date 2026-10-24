package com.narudzbine.shared.api;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class RecoveryContainmentTest {
    @Test void normalModeDoesNotSilentlyDisableAuthorizedFeatures() {
        var values = Map.of("identity.http.enabled", "true");
        assertThat(RecoveryContainment.inspect(values::get, Map.of()).contained()).isFalse();
    }
    @Test void containedModeRejectsEveryCurrentFeatureAndNeverEchoesItsValue() {
        assertThat(RecoveryContainment.inspect(k -> k.equals("operations.recovery.contained") ? "true" : null, Map.of()).contained()).isTrue();
        for (String feature : RecoveryContainment.DISABLED_FEATURES) {
            var values = Map.of("operations.recovery.contained", "true", feature, "PRIVATE-CONFIGURATION");
            assertThatThrownBy(() -> RecoveryContainment.inspect(values::get, Map.of()))
                    .isInstanceOf(IllegalStateException.class).hasMessageContaining(feature).hasMessageNotContaining("PRIVATE-CONFIGURATION").hasNoCause();
        }
    }
    @Test void externalMarkerCannotBeContradictedAndMalformedModesAreSanitized() {
        for (boolean contained : List.of(true, false)) {
            assertThatThrownBy(() -> RecoveryContainment.inspect(k -> Boolean.toString(!contained), Map.of("OPERATIONS_RECOVERY_CONTAINED", Boolean.toString(contained))))
                    .isInstanceOf(IllegalStateException.class).hasMessage("Application configuration contradicts external recovery containment");
        }
        assertThat(RecoveryContainment.inspect(k -> null, Map.of("OPERATIONS_RECOVERY_CONTAINED", "true")).contained()).isTrue();
        assertThatThrownBy(() -> RecoveryContainment.inspect(k -> "PRIVATE", Map.of()))
                .hasMessage("Explicit boolean recovery containment configuration required").hasNoCause();
    }
    @Test void scopedWorkerIsRejectedBeforeSettingsWhileExplicitMigrationIsStillSeparate() {
        var pinned = Map.of("OPERATIONS_RECOVERY_CONTAINED", "true");
        for (String[] args : List.of(new String[]{"--redaction-worker"}, new String[]{"--redaction-worker", "invalid", "--completion-only"}, new String[]{"--redaction-worker-invalid"})) {
            assertThatThrownBy(() -> RecoveryContainment.commandGuard(args, pinned)).hasMessage("Ordinary scoped worker is unavailable during recovery containment");
        }
        assertThatCode(() -> RecoveryContainment.commandGuard(new String[]{"--migrate"}, pinned)).doesNotThrowAnyException();
        assertThatCode(() -> RecoveryContainment.commandGuard(new String[]{"--redaction-worker"}, Map.of())).doesNotThrowAnyException();
    }
}
