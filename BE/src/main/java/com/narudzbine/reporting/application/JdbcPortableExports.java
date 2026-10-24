package com.narudzbine.reporting.application;

import com.narudzbine.audit.api.*;
import com.narudzbine.reporting.api.PortableExports;
import com.narudzbine.shared.api.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.slf4j.MDC;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

/** Application methods join the controller's current-authority transaction. */
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcPortableExports implements PortableExports {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private final JdbcTemplate jdbc;private final PortableExportSettings settings;private final PrivateCaseReview operators;
 private final ObjectProvider<ResourceRevisions> revisions;private final Clock clock;private final UuidGenerator ids;
 public JdbcPortableExports(JdbcTemplate jdbc,PortableExportSettings settings,PrivateCaseReview operators,ObjectProvider<ResourceRevisions> revisions,Clock clock,UuidGenerator ids){this.jdbc=jdbc;this.settings=settings;this.operators=operators;this.revisions=revisions;this.clock=clock;this.ids=ids;}
 @Override public View approve(PrivateCaseReview.Actor actor,UUID caseId,UUID id,String expected,Context context){
  settings.envelope();long qualification=operators.qualify(actor.account());
  jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))","privacy-export/id/"+id);
  var old=find(caseId,id);
  byte[] payload=hash(JSON.writeValueAsString(List.of(caseId,expected,context.reason(),context.caseReference())).getBytes(StandardCharsets.UTF_8));
  if(old.isPresent()){
   var row=old.get();if(!actor.account().equals(row.approvedBy()))throw new PrivacyFailure("NOT_FOUND");
   if(!MessageDigest.isEqual(payload,row.approvalDigest()))throw new PrivacyFailure("IDEMPOTENCY_MISMATCH");
   if(!now().isBefore(row.created().plus(Duration.ofDays(7))))throw new PrivacyFailure("REPLAY_EXPIRED",id);
   if(row.original()==null)throw new PrivacyFailure("SERVICE_UNAVAILABLE");return JSON.readValue(row.original(),View.class);
  }
  if(jdbc.queryForObject("SELECT count(*) FROM privacy_export_metadata WHERE id=?",Integer.class,id)>0)throw new PrivacyFailure("NOT_FOUND");
  if(!settings.accepting())throw new PrivacyFailure("SERVICE_UNAVAILABLE");
  var target=operators.route(caseId).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));
  String kind=jdbc.queryForObject("SELECT kind FROM privacy_case_metadata WHERE id=?",String.class,caseId);
  if(!"EXPORT".equals(kind))throw new PrivacyFailure("INVALID_STATE");
  jdbc.queryForObject("SELECT expire_privacy_exports(?,?)",Integer.class,caseId,Timestamp.from(now()));
  long revision=jdbc.queryForList("SELECT revision FROM privacy_fulfillment_metadata WHERE case_id=?",Long.class,caseId).stream().findFirst().orElse(1L);
  if(!revisions.getObject().matches("privacy/v1",caseId,revision,expected))throw new PrivacyFailure("REVISION_CONFLICT");
  if(jdbc.queryForObject("SELECT count(*) FROM privacy_export_metadata WHERE case_id=? AND state IN('QUEUED','READY')",Integer.class,caseId)>0)throw new PrivacyFailure("INVALID_STATE");
  if(jdbc.queryForList("SELECT state FROM privacy_fulfillment_metadata WHERE case_id=?",String.class,caseId).contains("COMPLETED"))throw new PrivacyFailure("INVALID_STATE");
  Instant at=now();var result=new View(id,caseId,revisions.getObject().encode("portable/v1",id,1),"QUEUED",1,time(at),null,null,null,null);
  UUID audit=ids.next();audit(audit,actor.account(),target,id,"PRIVACY_EXPORT_APPROVED",context.reason(),at);
  jdbc.update("""
   INSERT INTO privacy_export_job(id,case_id,organization_id,country,approved_by,approved_session,approved_transport,approved_qualification,approval_audit_id,expected_case_revision,case_revision_token,approval_digest,private_reference,original_response,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?)
   """,id,caseId,target.organization(),target.country(),actor.account(),actor.session(),actor.transport(),qualification,audit,revision,expected,payload,context.caseReference(),JSON.writeValueAsString(result),Timestamp.from(at),Timestamp.from(at));
  return result;
 }
 @Override public View administrative(PrivateCaseReview.Actor actor,UUID caseId,UUID id){
  settings.envelope();operators.qualify(actor.account());var target=operators.route(caseId).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));
  jdbc.queryForObject("SELECT expire_privacy_exports(?,?)",Integer.class,caseId,Timestamp.from(now()));
  var row=find(caseId,id).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));audit(ids.next(),actor.account(),target,row.id(),"PRIVACY_EXPORT_METADATA_READ",null,now());return view(row);
 }
 @Override public View status(Scope scope,UUID caseId,UUID id){
  settings.envelope();var rows=jdbc.query("SELECT *,original_response::text AS original FROM owned_privacy_export(?,?,?,?,?,?,?,?)",JdbcPortableExports::map,caseId,id,scope.actor(),scope.session(),scope.transport(),scope.organization(),scope.country(),Timestamp.from(now()));
  return view(rows.stream().findFirst().orElseThrow(()->new PrivacyFailure("NOT_FOUND")));
 }
 @Override public Content content(Scope scope,UUID caseId,UUID id){
  var envelope=settings.envelope();var rows=jdbc.queryForList("SELECT * FROM disclose_privacy_export(?,?,?,?,?,?,?,?,?,?)",caseId,id,scope.actor(),scope.session(),scope.transport(),scope.organization(),scope.country(),Timestamp.from(now()),ids.next(),requestId());
  if(rows.isEmpty())throw new PrivacyFailure("NOT_FOUND");var row=rows.getFirst();if(row.get("failure")!=null)return new Content(null,(String)row.get("failure"));
  try{byte[] bytes=envelope.decrypt(id,(byte[])row.get("ciphertext"));if(bytes.length!=((Number)row.get("bytes")).intValue()||!MessageDigest.isEqual(hash(bytes),(byte[])row.get("sha256")))throw new IllegalArgumentException();return new Content(bytes,null);}
  catch(IllegalArgumentException failure){throw new PrivacyFailure("SERVICE_UNAVAILABLE");} // Throw to roll back disclosure evidence on corrupt/wrong-key content.
 }
 private Optional<Job> find(UUID source,UUID id){return jdbc.query("SELECT *,original_response::text AS original FROM privacy_export_metadata WHERE case_id=? AND(?::uuid IS NULL OR id=?) ORDER BY generation DESC LIMIT 1",JdbcPortableExports::map,source,id,id).stream().findFirst();}
 private View view(Job r){return new View(r.id(),r.caseId(),revisions.getObject().encode("portable/v1",r.id(),r.revision()),r.state(),1,time(r.created()),r.expires()==null?null:time(r.expires()),r.failure(),r.bytes(),r.records());}
 private static Job map(ResultSet r,int n)throws SQLException{return new Job(r.getObject("id",UUID.class),r.getObject("case_id",UUID.class),r.getLong("revision"),r.getString("state"),r.getTimestamp("created_at").toInstant(),r.getTimestamp("expires_at")==null?null:r.getTimestamp("expires_at").toInstant(),r.getString("failure_code"),r.getObject("byte_count")==null?null:r.getLong("byte_count"),r.getObject("record_count")==null?null:r.getLong("record_count"),r.getObject("approved_by",UUID.class),r.getBytes("approval_digest"),r.getString("original"));}
 private void audit(UUID id,UUID actor,PrivateCaseReview.Target target,UUID resource,String action,String reason,Instant at){jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,reason,changed_fields,target_organization_id,target_country) VALUES(?,'PLATFORM_ADMIN',?,?,'PRIVACY_EXPORT',?,'SUCCESS',?,?,?,ARRAY['metadata'],?,?)",id,actor,action,resource,requestId(),Timestamp.from(at),reason,target.organization(),target.country());}
 private UUID requestId(){String value=MDC.get("requestId");if(value!=null)try{UUID id=UUID.fromString(value);if(id.version()==7&&id.variant()==2)return id;}catch(IllegalArgumentException ignored){}return ids.next();}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
 private static String time(Instant at){return new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(at);}
 private static byte[] hash(byte[] bytes){try{return MessageDigest.getInstance("SHA-256").digest(bytes);}catch(NoSuchAlgorithmException e){throw new IllegalStateException("SHA-256 unavailable");}}
 private record Job(UUID id,UUID caseId,long revision,String state,Instant created,Instant expires,String failure,Long bytes,Long records,UUID approvedBy,byte[] approvalDigest,String original){@Override public String toString(){return "PortableJob[redacted]";}}
}

