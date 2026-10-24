package com.narudzbine.audit.infrastructure;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.*;

@Configuration(proxyBeanMethods=false)
@EnableScheduling
@ConditionalOnProperty(name="audit.privacy-replay-cleanup.enabled",havingValue="true")
public class PrivacyCleanupConfiguration {
    @Bean Driver privacyReplayCleanupDriver(PrivacyReplayCleanup cleanup,PrivateReviewCleanup reviews){return new Driver(cleanup,reviews);}
    public static final class Driver {
        private static final System.Logger LOG=System.getLogger(Driver.class.getName());
        private final PrivacyReplayCleanup cleanup;private final PrivateReviewCleanup reviews;
        Driver(PrivacyReplayCleanup cleanup,PrivateReviewCleanup reviews){this.cleanup=cleanup;this.reviews=reviews;}
        @Scheduled(fixedDelay=60000,initialDelay=60000)
        public void tick(){try{cleanup.sweep();}catch(RuntimeException deferred){LOG.log(System.Logger.Level.WARNING,"Privacy replay cleanup deferred; inspect sanitized health and retained receipt counts");}try{reviews.sweep();}catch(RuntimeException deferred){LOG.log(System.Logger.Level.WARNING,"Private review proof cleanup deferred; inspect grants and retained backlog");}}
    }
}
