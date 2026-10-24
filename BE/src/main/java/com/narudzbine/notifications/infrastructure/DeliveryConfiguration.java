package com.narudzbine.notifications.infrastructure;

import com.narudzbine.notifications.api.ProviderDelivery;
import com.narudzbine.shared.api.UuidGenerator;
import java.time.*;
import java.util.Base64;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods=false)
public class DeliveryConfiguration {
    @Bean @ConditionalOnProperty(name="notifications.providers.resend.enabled",havingValue="true")
    ProviderDelivery.Email resend(Clock clock,@Value("${notifications.providers.resend.api-key}")String key,@Value("${notifications.providers.resend.conformance-verified:false}")boolean verified){if(!verified)throw new IllegalArgumentException("Recorded Resend conformance required before activation");return new ResendEmail(key,clock);}
    @Bean @ConditionalOnProperty(name="notifications.providers.fcm.enabled",havingValue="true")
    ProviderDelivery.Push fcm(Clock clock,@Value("${notifications.devices.environment}")String environment,@Value("${notifications.devices.project-id}")String project,@Value("${notifications.providers.fcm.client-email}")String email,@Value("${notifications.providers.fcm.private-key-id}")String keyId,@Value("${notifications.providers.fcm.private-key-pem}")String pem,@Value("${notifications.providers.fcm.conformance-verified:false}")boolean verified){if(!verified)throw new IllegalArgumentException("Recorded FCM/app/environment conformance required before activation");return new FcmPush(environment,project,email,keyId,pem,clock);}
    @Bean @ConditionalOnProperty(name="notifications.email-webhook.enabled",havingValue="true")
    EmailCallbacks emailCallbacks(JdbcTemplate jdbc,Clock clock,PlatformTransactionManager manager,@Value("${notifications.email-webhook.secret}")String key,@Value("${notifications.email-webhook.previous-secret:}")String previous,@Value("${notifications.email-webhook.previous-secret-valid-until:}")String until){return new EmailCallbacks(jdbc,clock,manager,key,previous,until.isEmpty()?null:Instant.parse(until));}

    @Configuration(proxyBeanMethods=false) @EnableScheduling
    @ConditionalOnProperty(name="notifications.delivery.enabled",havingValue="true")
    static class Workers {
        @Bean(destroyMethod="close") ExternalDeliveryEngine externalDeliveryEngine(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,PlatformTransactionManager manager,ObjectProvider<ProviderDelivery.Email> email,ObjectProvider<ProviderDelivery.Push> push,ObjectProvider<ProviderDelivery.Devices> devices,ObjectProvider<ProviderDelivery.TechnicalEmails> technical,@Value("${notifications.delivery.encryption-key}")String key,@Value("${notifications.delivery.from}")String from,@Value("${notifications.delivery.client-base-url}")String base){return new ExternalDeliveryEngine(jdbc,clock,ids,manager,email.getIfAvailable(),push.getIfAvailable(),devices.getIfAvailable(),technical.getIfAvailable(),Base64.getDecoder().decode(key),from,base);}
        @Bean(destroyMethod="close") Driver externalDeliveryDriver(ExternalDeliveryEngine engine){return new Driver(engine);}
    }
    static final class Driver implements AutoCloseable {
        private final ExternalDeliveryEngine engine;private final ExecutorService coordinator;private final System.Logger logger;private final AtomicBoolean running=new AtomicBoolean();
        Driver(ExternalDeliveryEngine engine){this(engine,System.getLogger(DeliveryConfiguration.class.getName()),Executors.newSingleThreadExecutor());}
        Driver(ExternalDeliveryEngine engine,System.Logger logger,ExecutorService coordinator){this.engine=engine;this.logger=logger;this.coordinator=coordinator;}
        @Scheduled(fixedDelay=5000,initialDelay=5000)public void tick(){if(running.compareAndSet(false,true))coordinator.submit(()->{try{engine.tick();}catch(RuntimeException deferred){logger.log(System.Logger.Level.WARNING,"External delivery deferred; inspect queue and provider configuration");}finally{running.set(false);}});}
        public void close(){coordinator.shutdownNow();}
    }
}
