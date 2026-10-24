package com.narudzbine.reporting.application;

import static org.assertj.core.api.Assertions.*;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PortableExportSettingsTest {
    private String key(int value){byte[] bytes=new byte[32];Arrays.fill(bytes,(byte)value);return Base64.getEncoder().encodeToString(bytes);}
    @Test void defaultOffNeedsNoIdentityOrKeyAndCannotRunAWorker(){
        var disabled=new PortableExportSettings(false,false,true,false,"","");assertThat(disabled.enabled()).isFalse();assertThat(disabled.accepting()).isFalse();assertThat(disabled.worker()).isFalse();assertThatThrownBy(disabled::envelope).isInstanceOf(com.narudzbine.audit.api.PrivacyFailure.class);
        assertThatThrownBy(()->new PortableExportSettings(false,true,true,false,"","")).isInstanceOf(IllegalStateException.class);
    }
    @Test void enabledRequiresAuthenticatedHttpAndAnIsolatedFullLengthKey(){
        assertThatThrownBy(()->new PortableExportSettings(true,false,true,false,key(1),"")).isInstanceOf(IllegalStateException.class);
        for(String invalid:new String[]{"","malformed",Base64.getEncoder().encodeToString(new byte[31])})assertThatThrownBy(()->new PortableExportSettings(true,false,true,true,invalid,"")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(()->new PortableExportSettings(true,false,true,true,key(1),key(1))).isInstanceOf(IllegalStateException.class).hasMessageContaining("isolated");
    }
    @Test void acceptingAndWorkerGatesAreIndependentAndCipherIsPurposeAndResourceBound(){
        var settings=new PortableExportSettings(true,true,false,true,key(1),key(2));assertThat(settings.enabled()).isTrue();assertThat(settings.accepting()).isFalse();assertThat(settings.worker()).isTrue();UUID id=UUID.randomUUID();byte[] plain="Synthetic portable data".getBytes(java.nio.charset.StandardCharsets.UTF_8),cipher=settings.envelope().encrypt(id,plain);assertThat(cipher).isNotEqualTo(plain);assertThat(settings.envelope().decrypt(id,cipher)).isEqualTo(plain);assertThatThrownBy(()->settings.envelope().decrypt(UUID.randomUUID(),cipher)).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->new com.narudzbine.shared.api.SecretEnvelope(Base64.getDecoder().decode(key(1)),"commercial-export/v1").decrypt(id,cipher)).isInstanceOf(IllegalArgumentException.class);
    }
}
