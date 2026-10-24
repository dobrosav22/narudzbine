package com.narudzbine.reporting.infrastructure;

import com.narudzbine.reporting.application.PortableExportSettings;
import com.narudzbine.reporting.application.PortableExportWorker;
import com.zaxxer.hikari.*;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.scheduling.annotation.*;

/** A wrapper owns the restricted pool; Boot still configures the ordinary application DataSource. */
@Configuration(proxyBeanMethods=false)
@EnableScheduling
@ConditionalOnProperty(name={"privacy.exports.enabled","privacy.exports.worker-enabled"},havingValue="true")
public class PortableExportConfiguration {
 @Bean(destroyMethod="close") WorkerRuntime portableExportWorker(PortableExportSettings settings,Clock clock,
   @Value("${privacy.exports.jdbc-url:}")String url,@Value("${privacy.exports.username:}")String username,
   @Value("${privacy.exports.password:}")String password,@Value("${spring.datasource.url:}")String applicationUrl){
  if(username.isBlank()||password.isBlank()||!url.startsWith("jdbc:postgresql:")||!url.equals(applicationUrl))throw new IllegalStateException("Explicit restricted portable worker credential for the application database required");
  var config=new HikariConfig();config.setJdbcUrl(url);config.setUsername(username);config.setPassword(password);config.setMaximumPoolSize(2);config.setMinimumIdle(0);config.setConnectionTimeout(3000);config.setPoolName("portable-json-worker");config.setConnectionInitSql("SET lock_timeout='2s'");
  var pool=new HikariDataSource(config);
  try{var jdbc=new JdbcTemplate(pool);PortableWorkerAuthority.verify(jdbc);return new WorkerRuntime(pool,new PortableExportWorker(jdbc,new JdbcTransactionManager(pool),settings,clock));}catch(RuntimeException failure){pool.close();throw failure;}
 }
 public static final class WorkerRuntime implements AutoCloseable {
  private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(WorkerRuntime.class);
  private final HikariDataSource pool;private final PortableExportWorker worker;
  WorkerRuntime(HikariDataSource pool,PortableExportWorker worker){this.pool=pool;this.worker=worker;}
  @Scheduled(fixedDelay=5000,initialDelayString="${privacy.exports.initial-delay-ms:5000}") public void tick(){try{worker.tick();}catch(RuntimeException failure){LOG.warn("Portable JSON generation deferred; inspect sanitized job and database health metadata");}}
  @Override public void close(){pool.close();}
 }
}
