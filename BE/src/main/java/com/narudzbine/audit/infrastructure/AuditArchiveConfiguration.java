package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import com.zaxxer.hikari.*;
import java.net.URI;
import java.nio.file.Path;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.scheduling.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods=false) @EnableScheduling
@ConditionalOnProperty(name="audit.archive.enabled",havingValue="true")
public class AuditArchiveConfiguration {
 @Bean(destroyMethod="close") Runtime auditArchiveRuntime(Environment env,Clock clock,UuidGenerator ids){
  Settings settings=Settings.read(env);IndependentObjects objects=null;HikariDataSource pool=null;
  try{
   objects=settings.mode.equals("LOCAL_SYNTHETIC")?new FileIndependentObjectStore(Path.of(settings.localRoot)):new R2IndependentObjectStore(R2IndependentObjectStore.client(URI.create(settings.endpoint),settings.access,settings.secret),settings.bucket);
   var evidence=new IndependentEvidence(objects,settings.keys,settings.active,settings.prohibited);
   var config=new HikariConfig();config.setJdbcUrl(settings.url);config.setUsername(settings.username);config.setPassword(settings.password);config.setMaximumPoolSize(2);config.setMinimumIdle(0);config.setConnectionTimeout(3000);config.setPoolName("audit-archive-worker");config.setConnectionInitSql("SET statement_timeout='10s'; SET lock_timeout='2s'; SET TIME ZONE 'UTC'");pool=new HikariDataSource(config);var jdbc=new JdbcTemplate(pool);AuditArchiveAuthority.verify(jdbc,settings.policy,settings.reference);
   return new Runtime(pool,objects,new AuditArchiveWorker(jdbc,new JdbcTransactionManager(pool),evidence,clock,ids,settings.policy));
  }catch(RuntimeException failure){if(pool!=null)pool.close();closeStore(objects);throw failure;}
 }
 static final class Settings {
  String mode,localRoot,endpoint,bucket,access,secret,url,username,password,active,reference;UUID policy;Map<String,byte[]> keys;List<byte[]> prohibited;
  static Settings read(Environment env){
   try{
    var s=new Settings();s.mode=required(env,"mode");s.reference=required(env,"configuration-reference");if(!s.reference.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}"))throw invalid();s.policy=UUID.fromString(required(env,"policy-id"));if(s.policy.version()!=7||s.policy.variant()!=2)throw invalid();
    s.url=required(env,"jdbc-url");s.username=required(env,"username");s.password=required(env,"password");if(!s.url.startsWith("jdbc:postgresql:")||!s.url.equals(env.getProperty("spring.datasource.url"))||s.username.equals(env.getProperty("spring.datasource.username")))throw invalid();
    s.active=required(env,"active-key-version");String ring=required(env,"key-ring");if(ring.length()>4096)throw invalid();var tree=JsonMapper.builder().enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION).build().readTree(ring);if(!tree.isObject()||tree.size()<1||tree.size()>32)throw invalid();s.keys=new HashMap<>();for(var entry:tree.properties()){if(!entry.getValue().isString())throw invalid();s.keys.put(entry.getKey(),Base64.getDecoder().decode(entry.getValue().asString()));}s.prohibited=new ArrayList<>();for(String property:List.of("privacy.exports.artifact-key","reporting.exports.artifact-key")){String key=env.getProperty(property,"");if(!key.isEmpty())try{s.prohibited.add(Base64.getDecoder().decode(key));}catch(IllegalArgumentException ignored){/* Disabled unrelated settings may be absent or unusable. */}}
    // Validate key separation before opening either object storage or database connections.
    new IndependentEvidence(new UnavailableObjects(),s.keys,s.active,s.prohibited);
    if(s.mode.equals("LOCAL_SYNTHETIC")){s.localRoot=required(env,"local-root");if(!env.getProperty("audit.archive.local-synthetic-acknowledged",Boolean.class,false))throw invalid();}
    else if(s.mode.equals("R2")){
     s.endpoint=required(env,"endpoint");s.bucket=required(env,"bucket");s.access=required(env,"access-key");s.secret=required(env,"secret-key");String conformance=required(env,"conformance-reference");if(!s.endpoint.matches("https://[0-9a-f]{32}\\.eu\\.r2\\.cloudflarestorage\\.com")||!s.bucket.matches("[a-z0-9][a-z0-9-]{1,61}[a-z0-9]")||!conformance.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}"))throw invalid();
     if(s.bucket.equals(env.getProperty("media.storage.bucket"))||s.access.equals(env.getProperty("media.storage.access-key"))||s.secret.equals(env.getProperty("media.storage.secret-key")))throw invalid();
    }else throw invalid();return s;
   }catch(RuntimeException failure){throw invalid();} // Never expose key-ring values or parser excerpts.
  }
  static String required(Environment env,String key){String value=env.getProperty("audit.archive."+key,"");if(value.isBlank())throw invalid();return value;}
  static IllegalStateException invalid(){return new IllegalStateException("Explicit isolated audit archive configuration required");}
  @Override public String toString(){return "ArchiveSettings[redacted]";}
 }
 private static final class UnavailableObjects implements IndependentObjects {public boolean create(Key k,byte[] b){throw new UnsupportedOperationException();}public Optional<byte[]> read(Key k){throw new UnsupportedOperationException();}public Page list(Family f,int n,Key a){throw new UnsupportedOperationException();}}
 static void closeStore(IndependentObjects objects){if(objects instanceof AutoCloseable closeable)try{closeable.close();}catch(Exception ignored){/* Shutdown must still close the restricted pool. */}}
 public static final class Runtime implements AutoCloseable {
  private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(Runtime.class);
  private final HikariDataSource pool;private final IndependentObjects objects;private final AuditArchiveWorker worker;private final ExecutorService coordinator=Executors.newSingleThreadExecutor();private final AtomicBoolean running=new AtomicBoolean();
  Runtime(HikariDataSource pool,IndependentObjects objects,AuditArchiveWorker worker){this.pool=pool;this.objects=objects;this.worker=worker;}
  @Scheduled(fixedDelay=5000,initialDelayString="${audit.archive.initial-delay-ms:5000}") public void tick(){if(running.compareAndSet(false,true))try{coordinator.submit(()->{try{worker.tick();}catch(java.lang.RuntimeException failure){LOG.warn("Audit archive deferred; inspect sanitized pending-run and database health metadata");}finally{running.set(false);}});}catch(RejectedExecutionException stopped){running.set(false);}}
  @Override public void close(){coordinator.shutdown();try{if(!coordinator.awaitTermination(25,TimeUnit.SECONDS))coordinator.shutdownNow();}catch(InterruptedException interrupted){coordinator.shutdownNow();Thread.currentThread().interrupt();}finally{closeStore(objects);pool.close();}}
 }
}
