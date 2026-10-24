package com.narudzbine.architecture;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.api.RecoveryContainment;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

class RecoveryFeatureRegistryTest {
    @Test void everyProductionConditionalFeatureParticipatesInContainment() {
        var classes = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages("com.narudzbine");
        Set<String> discovered = new TreeSet<>();
        for (var type : classes) {
            if (type.isAnnotatedWith(ConditionalOnProperty.class)) collect(type.getAnnotationOfType(ConditionalOnProperty.class), discovered);
            for (var method : type.getMethods()) if (method.isAnnotatedWith(ConditionalOnProperty.class)) collect(method.getAnnotationOfType(ConditionalOnProperty.class), discovered);
        }
        assertThat(discovered).isNotEmpty().containsExactlyInAnyOrderElementsOf(RecoveryContainment.DISABLED_FEATURES);
    }
    private static void collect(ConditionalOnProperty condition, Set<String> discovered) {
        assertThat(condition.matchIfMissing()).as("ordinary features must remain disabled when missing").isFalse();
        assertThat(condition.havingValue()).isIn("", "true");
        String prefix = condition.prefix(); if (!prefix.isEmpty() && !prefix.endsWith(".")) prefix += ".";
        String[] names = condition.name().length == 0 ? condition.value() : condition.name();
        for (String name : names) discovered.add(prefix + name);
    }
}
