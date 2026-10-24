package com.narudzbine.identity.infrastructure;

import com.narudzbine.identity.api.PasswordCredentialVerifier;
import java.net.URI;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "identity.provider.enabled", havingValue = "true")
public class FusionAuthConfiguration {
    @Bean
    @ConditionalOnProperty(name="identity.setup.http.enabled",havingValue="true")
    com.narudzbine.identity.api.SetupCredentialProvider setupCredentialProvider(@Value("${identity.provider.endpoint}")URI endpoint,
            @Value("${identity.provider.tenant}")UUID tenant,@Value("${identity.provider.application}")UUID application,
            @Value("${identity.provider.api-key}")String key,@Value("${identity.provider.setup-conformance:false}")boolean conformant){
        if(!conformant){throw new IllegalStateException("Recorded G-02 setup conformance is required before provider activation.");}
        return new FusionAuthSetupProvider(endpoint,tenant,application,key);
    }
    @Bean
    com.narudzbine.identity.api.EmailCredentialMutator emailCredentialMutator(@Value("${identity.provider.endpoint}") URI endpoint,
            @Value("${identity.provider.tenant}") UUID tenant,@Value("${identity.provider.api-key}") String key,
            @Value("${identity.provider.email-lifecycle-conformance:false}") boolean conformant) {
        if(!conformant) { throw new IllegalStateException("Recorded G-02 email lifecycle conformance is required before provider activation."); }
        return new FusionAuthEmailMutator(endpoint,tenant,key);
    }
    @Bean
    com.narudzbine.identity.api.PasswordCredentialMutator passwordCredentialMutator(@Value("${identity.provider.endpoint}") URI endpoint,
            @Value("${identity.provider.tenant}") UUID tenant,@Value("${identity.provider.api-key}") String key,
            @Value("${identity.provider.password-lifecycle-conformance:false}") boolean conformant) {
        if(!conformant) { throw new IllegalStateException("Recorded G-02 password lifecycle conformance is required before provider activation."); }
        return new FusionAuthPasswordMutator(endpoint,tenant,key);
    }
    @Bean
    PasswordCredentialVerifier passwordCredentialVerifier(@Value("${identity.provider.endpoint}") URI endpoint,
            @Value("${identity.provider.tenant}") UUID tenant, @Value("${identity.provider.application}") UUID application,
            @Value("${identity.provider.api-key}") String key) {
        return new FusionAuthPasswordVerifier(endpoint, tenant, application, key);
    }
}
