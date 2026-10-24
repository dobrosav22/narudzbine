package com.narudzbine.contract;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class OpenApiContractTest {
    @Test
    void contractReferencesAndTargetedRetryBoundariesRemainValid() throws Exception {
        JsonNode root = JsonMapper.builder().build().readTree(Files.readString(Path.of("../openapi.yaml")));
        assertThat(root.path("openapi").asText()).isEqualTo("3.1.0");
        Set<String> ids = new HashSet<>();
        Set<String> keyed = new HashSet<>();
        for (JsonNode methods : root.path("paths")) {
            for (JsonNode operation : methods) {
                String id = operation.path("operationId").asText();
                assertThat(id).isNotBlank();
                assertThat(ids.add(id)).as("unique operation %s", id).isTrue();
                assertThat(operation.path("x-authorization").asText()).isNotBlank();
                for (JsonNode parameter : operation.path("parameters")) {
                    if (parameter.path("$ref").asText().endsWith("/IdempotencyKey")) {
                        keyed.add(id);
                    }
                }
            }
        }
        assertThat(ids).hasSize(225);
        assertThat(keyed).containsExactlyInAnyOrder("submitOrder", "adjustStock", "createMessage", "resendInvitation");
        checkReferences(root, root);
        var schemas = root.path("components").path("schemas");
        assertThat(schemas.path("StockDelta").path("properties").path("delta").has("not")).isFalse();
        assertThat(schemas.path("OrderReview").path("properties").has("deliveryInstructions")).isTrue();
    }

    private void checkReferences(JsonNode root, JsonNode node) {
        if (node.isObject() && node.has("$ref")) {
            String reference = node.path("$ref").asText();
            assertThat(reference).startsWith("#/");
            assertThat(root.at(reference.substring(1)).isMissingNode()).as(reference).isFalse();
        }
        if (node.isObject() || node.isArray()) {
            for (JsonNode child : node) {
                checkReferences(root, child);
            }
        }
    }
}
