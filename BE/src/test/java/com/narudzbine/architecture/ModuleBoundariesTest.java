package com.narudzbine.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class ModuleBoundariesTest {
    private static final Set<String> MODULES = Set.of("identity", "organizations", "trading", "catalogue",
            "pricing", "inventory", "ordering", "buyerworkspace", "subscriptions", "notifications",
            "reporting", "media", "audit", "shared");
    private static final Map<String, Set<String>> ALLOWED = Map.of(
            "identity", Set.of("organizations", "audit", "notifications", "trading", "subscriptions", "catalogue", "pricing", "inventory", "buyerworkspace", "ordering", "media", "reporting"),
            "organizations", Set.of("audit"),
            "subscriptions", Set.of("audit"),
            "catalogue", Set.of("audit"),
            "trading", Set.of("organizations", "subscriptions", "audit"),
            "pricing", Set.of("catalogue", "audit", "trading"),
            "inventory", Set.of("catalogue", "audit"),
            "ordering", Set.of("catalogue", "pricing", "inventory", "trading", "organizations", "buyerworkspace", "notifications", "audit", "subscriptions"),
            "media", Set.of("catalogue"),
            "reporting", Set.of("audit"));

    static boolean permitted(String origin, String target) {
        String from = module(origin);
        String to = module(target);
        if (from == null || to == null || from.equals(to)) {
            return true;
        }
        if ("shared".equals(from)) {
            return false;
        }
        if ("shared".equals(to)) {
            return !target.contains(".infrastructure.");
        }
        return ALLOWED.getOrDefault(from, Set.of()).contains(to)
                && target.startsWith("com.narudzbine." + to + ".api.");
    }

    private static String module(String name) {
        if (!name.startsWith("com.narudzbine.")) {
            return null;
        }
        String rest = name.substring("com.narudzbine.".length());
        String candidate = rest.split("\\.")[0];
        return MODULES.contains(candidate) ? candidate : null;
    }

    @Test
    void productionDependenciesRespectModulePorts() {
        var imported = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.narudzbine");
        assertThat(imported).isNotEmpty();
        classes().should(new ArchCondition<JavaClass>("respect explicit module ports") {
            @Override
            public void check(JavaClass item, ConditionEvents events) {
                for (var dependency : item.getDirectDependenciesFromSelf()) {
                    if (!permitted(item.getName(), dependency.getTargetClass().getName())) {
                        events.add(SimpleConditionEvent.violated(item, dependency.getDescription()));
                    }
                }
            }
        }).check(imported);
    }

    @Test
    void forbiddenDependencyExamplesAreRejected() {
        assertThat(permitted("com.narudzbine.ordering.application.Submit",
                "com.narudzbine.catalogue.infrastructure.ProductRepository")).isFalse();
        assertThat(permitted("com.narudzbine.shared.api.Money",
                "com.narudzbine.ordering.api.Order")).isFalse();
        assertThat(permitted("com.narudzbine.catalogue.application.Activate",
                "com.narudzbine.pricing.api.Price")).isFalse();
        assertThat(permitted("com.narudzbine.ordering.application.Submit",
                "com.narudzbine.catalogue.api.Product")).isTrue();
    }
}
