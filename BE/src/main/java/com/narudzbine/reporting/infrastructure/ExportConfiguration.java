package com.narudzbine.reporting.infrastructure;
import com.narudzbine.reporting.application.ExportEngine;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.*;

@Configuration(proxyBeanMethods=false)
@EnableScheduling
@ConditionalOnProperty(name="reporting.exports.enabled",havingValue="true")
public class ExportConfiguration {
    @Bean(destroyMethod="close") Driver exportDriver(ExportEngine engine){return new Driver(engine);}
    public static final class Driver implements AutoCloseable {
        private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(Driver.class);private final ExportEngine engine;
        private final java.util.concurrent.ExecutorService coordinator=java.util.concurrent.Executors.newSingleThreadExecutor();
        private final java.util.concurrent.atomic.AtomicBoolean running=new java.util.concurrent.atomic.AtomicBoolean();
        Driver(ExportEngine engine){this.engine=engine;}
        @Scheduled(fixedDelay=5000,initialDelayString="${reporting.exports.initial-delay-ms:5000}")
        public void tick(){if(running.compareAndSet(false,true))coordinator.submit(()->{try{engine.tick();}catch(RuntimeException e){LOG.warn("Export generation deferred; inspect sanitized database and health evidence");}finally{running.set(false);}});}
        @Override public void close(){coordinator.shutdownNow();}
    }
}
