package com.narudzbine.media.infrastructure;
import com.narudzbine.media.application.ProcessedMaintenance;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.*;
@Configuration(proxyBeanMethods=false)
@EnableScheduling
@ConditionalOnProperty(name="media.processed-maintenance.enabled",havingValue="true")
public class ProcessedMaintenanceConfiguration {
    @Bean Sweeper processedSweeper(ProcessedMaintenance maintenance){return new Sweeper(maintenance);}
    public static final class Sweeper {
        private final ProcessedMaintenance maintenance;
        Sweeper(ProcessedMaintenance maintenance){this.maintenance=maintenance;}
        @Scheduled(fixedDelay=60000,initialDelay=60000) public void sweep(){maintenance.sweep();}
    }
}
