package com.narudzbine.media.infrastructure;
import com.narudzbine.media.api.*;
import com.narudzbine.media.application.QuarantineMaintenance;
import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.Scheduled;
@Configuration(proxyBeanMethods=false)
public class QuarantineConfiguration {
    @Bean(destroyMethod="close") @ConditionalOnProperty(name="media.storage.enabled",havingValue="true")
    R2Quarantine r2(@Value("${media.storage.endpoint}")String endpoint,@Value("${media.storage.bucket}")String bucket,@Value("${media.storage.access-key}")String access,@Value("${media.storage.secret-key}")String secret){
        if(!endpoint.matches("https://[0-9a-f]{32}\\.eu\\.r2\\.cloudflarestorage\\.com")||!bucket.matches("[a-z0-9][a-z0-9-]{1,61}[a-z0-9]")||access.isBlank()||secret.isBlank()){throw new IllegalArgumentException("Explicit private EU storage configuration required");}
        return new R2Quarantine(R2Quarantine.client(URI.create(endpoint),access,secret),bucket);
    }
    @Bean @ConditionalOnMissingBean(PrivateQuarantine.class)
    PrivateQuarantine unavailableQuarantine(){return new PrivateQuarantine(){public void ensure(String key,java.nio.file.Path file,long bytes,String sha,String md5,String type){throw new MediaFailure("SERVICE_UNAVAILABLE");}public void delete(String key){throw new MediaFailure("SERVICE_UNAVAILABLE");}};}
    @Bean @ConditionalOnMissingBean(ProcessedContentStorage.class)
    ProcessedContentStorage unavailableContent(){return (key,bytes,sha)->{throw new MediaFailure("SERVICE_UNAVAILABLE");};}
    @Bean @ConditionalOnProperty(name="media.quarantine-maintenance.enabled",havingValue="true")
    Sweeper quarantineSweeper(QuarantineMaintenance maintenance){return new Sweeper(maintenance);}
    public static final class Sweeper {
        private final QuarantineMaintenance maintenance;Sweeper(QuarantineMaintenance maintenance){this.maintenance=maintenance;}
        @Scheduled(fixedDelay=60000,initialDelay=60000) public void sweep(){maintenance.sweep();}
    }
}
