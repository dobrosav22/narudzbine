package com.narudzbine.shared.api;

import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/** External launch state; restored database rows cannot authorize ordinary resumption. */
public record RecoveryContainment(boolean contained) {
    public static final Set<String> DISABLED_FEATURES = Set.of(
            "audit.archive.enabled",
            "audit.case-dispositions.enabled",
            "audit.holds.enabled",
            "audit.privacy-replay-cleanup.enabled",
            "audit.privacy-review.enabled",
            "audit.redaction-plans.enabled",
            "audit.redaction-preview.enabled",
            "identity.external.http.enabled",
            "identity.external.provider.enabled",
            "identity.http.enabled",
            "identity.provider.enabled",
            "identity.recovery.http.enabled",
            "identity.setup.http.enabled",
            "media.processed-maintenance.enabled",
            "media.processing.enabled",
            "media.quarantine-maintenance.enabled",
            "media.storage.enabled",
            "notifications.delivery.enabled",
            "notifications.email-webhook.enabled",
            "notifications.inbox.enabled",
            "notifications.providers.fcm.enabled",
            "notifications.providers.resend.enabled",
            "privacy.exports.enabled",
            "privacy.exports.worker-enabled",
            "reporting.exports.enabled");

    public static RecoveryContainment inspect(Function<String, String> properties, Map<String, String> launch) {
        String pinned = launch.get("OPERATIONS_RECOVERY_CONTAINED");
        String configured = properties.apply("operations.recovery.contained");
        boolean external = pinned != null && strict(pinned);
        boolean selected = configured == null ? external : strict(configured);
        if (pinned != null && selected != external) {
            throw new IllegalStateException("Application configuration contradicts external recovery containment");
        }
        if (selected) {
            for (String feature : DISABLED_FEATURES) {
                String value = properties.apply(feature);
                if (value != null && !"false".equals(value)) {
                    throw new IllegalStateException("Contained recovery requires ordinary features disabled: " + feature);
                }
            }
        }
        return new RecoveryContainment(selected);
    }

    public static void commandGuard(String[] args, Map<String, String> launch) {
        String value = launch.get("OPERATIONS_RECOVERY_CONTAINED");
        if (value != null && strict(value)) {
            for (String argument : args) {
                if (argument.startsWith("--redaction-worker")) {
                    throw new IllegalStateException("Ordinary scoped worker is unavailable during recovery containment");
                }
            }
        }
    }

    private static boolean strict(String value) {
        if (!Set.of("true", "false").contains(value)) {
            throw new IllegalStateException("Explicit boolean recovery containment configuration required");
        }
        return Boolean.parseBoolean(value);
    }
}
