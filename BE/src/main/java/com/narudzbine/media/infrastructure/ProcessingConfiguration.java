package com.narudzbine.media.infrastructure;

import com.narudzbine.media.api.*;
import com.narudzbine.media.application.MediaProcessing;
import com.narudzbine.shared.api.UuidGenerator;
import com.zaxxer.hikari.*;
import java.nio.file.Path;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Separate worker credential; never replace the application's primary DataSource. */
@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name="media.processing.enabled",havingValue="true")
@EnableScheduling
public class ProcessingConfiguration {
    @Bean(destroyMethod="close") WorkerRuntime mediaWorker(R2Quarantine storage,Clock clock,UuidGenerator ids,
            @Value("${media.processing.jdbc-url}")String url,@Value("${media.processing.username}")String user,
            @Value("${media.processing.password}")String password) {
        if(user.isBlank()||password.isBlank()||!url.startsWith("jdbc:postgresql:")) throw new IllegalArgumentException("Explicit processing database credential required");
        var processor=new NativeImageProcessor(Path.of("/opt/magick/processor"));
        var config=new HikariConfig();config.setJdbcUrl(url);config.setUsername(user);config.setPassword(password);
        config.setMaximumPoolSize(2);config.setMinimumIdle(0);config.setConnectionTimeout(3000);config.setPoolName("media-processing");
        config.setConnectionInitSql("SET lock_timeout='2s'");
        var pool=new HikariDataSource(config);
        try{var jdbc=new JdbcTemplate(pool);ProcessingAuthority.verify(jdbc);return new WorkerRuntime(pool,new MediaProcessing(jdbc,clock,ids,storage,storage,processor,new JdbcTransactionManager(pool)));}
        catch(RuntimeException failure){pool.close();throw failure;}
    }
    public static final class WorkerRuntime implements AutoCloseable {
        private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(WorkerRuntime.class);
        private final HikariDataSource pool;private final MediaProcessing worker;
        WorkerRuntime(HikariDataSource pool,MediaProcessing worker){this.pool=pool;this.worker=worker;}
        @Scheduled(fixedDelay=5000,initialDelay=5000) public void tick(){try{worker.tick();}catch(RuntimeException failure){LOG.warn("Media processing attempt deferred");}}
        @Override public void close(){pool.close();}
    }
}
