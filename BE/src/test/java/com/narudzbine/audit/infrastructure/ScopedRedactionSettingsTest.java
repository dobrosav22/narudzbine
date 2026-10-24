package com.narudzbine.audit.infrastructure;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class ScopedRedactionSettingsTest {
    private MockEnvironment valid() {
        return new MockEnvironment()
                .withProperty("audit.redaction-worker.mode", "LOCAL_SYNTHETIC")
                .withProperty("audit.redaction-worker.environment", "SYNTHETIC")
                .withProperty("audit.redaction-worker.configuration-reference", "SYN-LOCAL")
                .withProperty("audit.redaction-worker.jdbc-url", "jdbc:postgresql://localhost/test")
                .withProperty("audit.redaction-worker.username", "synthetic_worker")
                .withProperty("audit.redaction-worker.password", "synthetic-only")
                .withProperty("audit.redaction-worker.local-root", ".")
                .withProperty("audit.redaction-worker.local-synthetic-acknowledged", "true")
                .withProperty("audit.redaction-worker.active-key-version", "v1")
                .withProperty("audit.redaction-worker.key-ring", "{\"v1\":\"" + Base64.getEncoder().encodeToString(new byte[32]) + "\"}");
    }
    @Test void explicitLocalConfigurationAndStrictOneJobArguments() {
        assertThat(ScopedRedactionSettings.read(valid()).environment).isEqualTo("SYNTHETIC");
        var id = "019a0b00-0000-7000-8000-000000000001";
        assertThat(ScopedRedactionWorkerCommand.parse(new String[]{"--redaction-worker", id})).isEqualTo(UUID.fromString(id));
        for (String[] args : List.of(new String[]{"--redaction-worker"},new String[]{"--redaction-worker", UUID.randomUUID().toString()},new String[]{"--redaction-worker",id,"--force"},new String[]{"--redaction-worker-invalid",id})) {
            assertThatThrownBy(() -> ScopedRedactionWorkerCommand.parse(args)).isInstanceOf(IllegalArgumentException.class);
        }
    }
    @Test void rejectsMissingAcknowledgementReusedPrincipalAndMalformedKeyRingWithoutLeakingInput() {
        for (MockEnvironment env : List.of(valid().withProperty("audit.redaction-worker.local-synthetic-acknowledged","false"),valid().withProperty("spring.datasource.username","synthetic_worker"),valid().withProperty("audit.redaction-worker.key-ring","PRIVATE-MALFORMED"),valid().withProperty("audit.redaction-worker.key-ring","{\"v1\":\"PRIVATE\",\"v1\":\"PRIVATE\"}"))) {
            assertThatThrownBy(() -> ScopedRedactionSettings.read(env)).isInstanceOf(IllegalStateException.class).hasMessage("Explicit isolated scoped redaction configuration required").hasNoCause();
        }
    }
    @Test void identityObservationRequiresCompleteExplicitIsolatedSettings(){
        String prefix="audit.redaction-worker.";String tenant="019a0b00-0000-7000-8000-000000000100";
        var configured=valid().withProperty(prefix+"identity-endpoint","https://synthetic.example/api/login").withProperty(prefix+"identity-tenant-id",tenant).withProperty(prefix+"identity-api-key","synthetic-read-only-key").withProperty(prefix+"identity-conformance-reference","SYN-IDENTITY");
        assertThat(ScopedRedactionSettings.read(configured).identityTenant).isEqualTo(UUID.fromString(tenant));assertThat(ScopedRedactionSettings.read(configured).identityAbsence).isFalse();
        for(var env:List.of(valid().withProperty(prefix+"identity-api-key","PRIVATE"),configured.withProperty(prefix+"identity-allow-absence","yes"))){assertThatThrownBy(()->ScopedRedactionSettings.read(env)).isInstanceOf(IllegalStateException.class).hasMessage("Explicit isolated scoped redaction configuration required").hasNoCause();}
    }

    @Test void canonicalExportEnvironmentKeysAreCheckedBeforeStorageOrDatabase(@org.junit.jupiter.api.io.TempDir java.nio.file.Path root){
        for(String property:List.of("PRIVACY_EXPORTS_ARTIFACT_KEY","REPORTING_EXPORTS_ARTIFACT_KEY")){
            var env=new HashMap<String,String>();String key=Base64.getEncoder().encodeToString(new byte[32]);env.put("REDACTION_WORKER_MODE","LOCAL_SYNTHETIC");env.put("REDACTION_WORKER_ENVIRONMENT","SYNTHETIC");env.put("REDACTION_WORKER_CONFIGURATION_REFERENCE","SYN-LOCAL");env.put("REDACTION_WORKER_JDBC_URL","jdbc:postgresql://localhost:1/test");env.put("REDACTION_WORKER_USERNAME","synthetic_worker");env.put("REDACTION_WORKER_PASSWORD","synthetic-only");env.put("REDACTION_WORKER_LOCAL_ROOT",root.resolve("not-created").toString());env.put("REDACTION_WORKER_LOCAL_SYNTHETIC_ACKNOWLEDGED","true");env.put("REDACTION_WORKER_ACTIVE_KEY_VERSION","v1");env.put("REDACTION_WORKER_KEY_RING","{\"v1\":\""+key+"\"}");env.put(property,key);
            assertThatThrownBy(()->ScopedRedactionWorkerCommand.run(new String[]{"--redaction-worker","019a0b00-0000-7000-8000-000000000001"},env)).isInstanceOf(IllegalStateException.class).hasMessage("Explicit isolated scoped redaction configuration required").hasNoCause();assertThat(root.resolve("not-created")).doesNotExist();
        }
    }

}
