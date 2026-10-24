package com.narudzbine.reporting.application;

import com.narudzbine.audit.api.PrivacyFailure;
import java.security.*;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;

/** One slot and two connections: authority transaction plus an independent bounded snapshot. */
public final class PortableExportWorker {
 private final JdbcTemplate jdbc;private final PortableExportSettings settings;private final Clock clock;
 private final TransactionTemplate authority,snapshot;private final Semaphore slot=new Semaphore(1);
 public PortableExportWorker(JdbcTemplate jdbc,PlatformTransactionManager manager,PortableExportSettings settings,Clock clock){
  this.jdbc=jdbc;this.settings=settings;this.clock=clock;authority=new TransactionTemplate(manager);authority.setTimeout(30);
  snapshot=new TransactionTemplate(manager);snapshot.setReadOnly(true);snapshot.setTimeout(25);snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);snapshot.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
 }
 public int tick(){
  if(!settings.worker()||!slot.tryAcquire())return 0;
  try{
   authority.executeWithoutResult(s->jdbc.queryForObject("SELECT sweep_privacy_exports(?)",Integer.class,Timestamp.from(now())));
   var next=jdbc.queryForList("SELECT id FROM privacy_export_work ORDER BY created_at,id LIMIT 1",UUID.class);if(next.isEmpty())return 0;UUID id=next.getFirst();
   return authority.execute(s->{
    var current=jdbc.queryForList("SELECT * FROM lock_privacy_export(?,?)",id,Timestamp.from(now()));if(current.isEmpty())return 0;var scope=current.getFirst();String result=(String)scope.get("result");
    if(result.equals("DEFER"))return 0;if(result.equals("EXPIRED"))return 1;
    if(result.equals("REVOKED")){fail(id,"ACCESS_REVOKED");return 1;}
    PortableProjection.Generated generated;
    try{generated=snapshot.execute(read->new PortableProjection(jdbc).render(id,(UUID)scope.get("case_id"),(UUID)scope.get("organization_id"),(String)scope.get("country"),(String)scope.get("organization_type"),now()));}
    catch(PortableJson.Limit limit){fail(id,limit.code());return 1;}
    catch(PrivacyFailure failure){if(!Set.of("ACCESS_REVOKED","SERVICE_UNAVAILABLE").contains(failure.code()))throw failure;fail(id,failure.code());return 1;}
    catch(RuntimeException failure){fail(id,"SERVICE_UNAVAILABLE");return 1;} // Only the read-only snapshot is caught; publication errors below retain their actual outcome.
    var bytes=generated.bytes();jdbc.queryForObject("SELECT publish_privacy_export(?,?,?,?,?,?)",String.class,id,settings.envelope().encrypt(id,bytes),hash(bytes),bytes.length,generated.records(),Timestamp.from(now()));
    return 1;
   });
  }finally{slot.release();}
 }
 private void fail(UUID id,String code){jdbc.queryForObject("SELECT fail_privacy_export(?,?,?)",Integer.class,id,code,Timestamp.from(now()));}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
 private static byte[] hash(byte[] value){try{return MessageDigest.getInstance("SHA-256").digest(value);}catch(NoSuchAlgorithmException e){throw new IllegalStateException("SHA-256 unavailable");}}
}
