package com.narudzbine.audit.infrastructure;
import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.*;
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
@Service @Transactional(propagation=Propagation.MANDATORY)
public class JdbcScopedRedactions implements ScopedRedactions {
 private static final JsonMapper JSON=JsonMapper.builder().build();private final JdbcTemplate jdbc;private final PrivateCaseReview operators;private final ObjectProvider<ResourceRevisions> revisions;private final Clock clock;private final UuidGenerator ids;
 public JdbcScopedRedactions(JdbcTemplate jdbc,PrivateCaseReview operators,ObjectProvider<ResourceRevisions> revisions,Clock clock,UuidGenerator ids){this.jdbc=jdbc;this.operators=operators;this.revisions=revisions;this.clock=clock;this.ids=ids;}
 public View approve(PrivateCaseReview.Access access,Command command){
  operators.qualify(access.actor().account());validAccess(access);if(!Set.of("ACCOUNT_DISPLAY_NAME_V1","REQUESTER_NAMES_V1","ACCOUNT_EMAIL_V1").contains(command.scopePolicy()))throw new PrivacyFailure("INVALID_SCOPE");Instant at=now();var old=find(access.caseId(),command.id());long expected=1;
  if(old.isEmpty()){expected=jdbc.queryForObject("SELECT coalesce((SELECT revision FROM privacy_redaction_fulfillment_metadata WHERE case_id=?),1)",Long.class,access.caseId());if(!revisions.getObject().matches("privacy/v1",access.caseId(),expected,command.expectedCaseRevision()))throw new PrivacyFailure("REVISION_MISMATCH");}
  Instant auth=jdbc.queryForObject("SELECT auth_at FROM application_session WHERE id=? AND account_id=?",(r,n)->r.getTimestamp(1).toInstant(),access.actor().session(),access.actor().account());Instant expiry=at.plusSeconds(60).isBefore(auth.plusSeconds(300))?at.plusSeconds(60):auth.plusSeconds(300);
  var original=new View(command.id(),access.caseId(),access.target().organization(),access.target().country(),command.scopePolicy(),"APPROVED",revision(command.id(),1),time(at),time(expiry),null,null,null,null,false);
  byte[] digest=digest(List.of(access.caseId(),command.id(),command.expectedCaseRevision(),command.scopePolicy(),command.references(),command.context()));
  String code=jdbc.queryForObject("SELECT prepare_scoped_redaction(?,?,?,?,?,?,?,?::jsonb,?,?::jsonb,?,?,?,?)",String.class,command.id(),access.id(),access.nonce(),access.actor().account(),access.actor().session(),access.actor().transport(),expected,JSON.writeValueAsString(command.references()),digest,JSON.writeValueAsString(original),ids.next(),requestId(),Timestamp.from(at),command.scopePolicy());check(code);
  if(!clock.instant().isBefore(access.expires()))throw new PrivacyFailure("NOT_FOUND");return JSON.readValue(find(access.caseId(),command.id()).orElseThrow(()->new PrivacyFailure("NOT_FOUND")).original(),View.class);
 }
 public View read(PrivateCaseReview.Actor actor,UUID caseId,UUID id){operators.qualify(actor.account());current(actor);var row=find(caseId,id).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,target_organization_id,target_country) VALUES(?,'PLATFORM_ADMIN',?,'PRIVACY_REDACTION_READ','PRIVACY_REDACTION',?,'SUCCESS',?,?,ARRAY['metadata'],?,?)",ids.next(),actor.account(),id,requestId(),Timestamp.from(now()),row.organization(),row.country());return view(row);}
 public View cancel(PrivateCaseReview.Access access,UUID id,String expectedRevision,PrivateCaseReview.Context context){
  operators.qualify(access.actor().account());validAccess(access);var row=find(access.caseId(),id).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));boolean replay="CANCELLED".equals(row.outcome());if(!replay&&!revisions.getObject().matches("redaction/v1",id,row.revision(),expectedRevision))throw new PrivacyFailure("REVISION_MISMATCH");Instant at=now();long basis=replay?row.resolutionFrom():row.revision();
  var original=new View(id,row.source(),row.organization(),row.country(),row.scope(),"CANCELLED",revision(id,basis+1),time(row.created()),time(row.expires()),"CANCELLED",null,time(at),null,false);byte[] digest=digest(List.of(access.caseId(),id,expectedRevision,context));
  String code=jdbc.queryForObject("SELECT cancel_scoped_redaction(?,?,?,?,?,?,?,?,?::jsonb,?,?,?)",String.class,id,access.id(),access.nonce(),access.actor().account(),access.actor().session(),access.actor().transport(),basis,digest,JSON.writeValueAsString(original),ids.next(),requestId(),Timestamp.from(at));check(code);if(!clock.instant().isBefore(access.expires()))throw new PrivacyFailure("NOT_FOUND");return JSON.readValue(find(access.caseId(),id).orElseThrow(()->new PrivacyFailure("NOT_FOUND")).cancelOriginal(),View.class);
 }
 private void validAccess(PrivateCaseReview.Access access){if(!operators.route(access.caseId()).orElseThrow(()->new PrivacyFailure("NOT_FOUND")).equals(access.target()))throw new PrivacyFailure("NOT_FOUND");}
 private void current(PrivateCaseReview.Actor actor){Instant at=now();if(jdbc.queryForList("SELECT a.id FROM account_identity a JOIN application_session s ON s.account_id=a.id WHERE a.id=? AND s.id=? AND s.transport=? AND a.kind='PLATFORM_ADMIN' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending AND s.revoked_at IS NULL AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation AND s.auth_at<=? AND ?<s.auth_at+interval '300 seconds' AND ?<s.absolute_expires_at AND ?<s.last_qualified_activity_at+interval '30 minutes' FOR SHARE OF a,s",UUID.class,actor.account(),actor.session(),actor.transport(),Timestamp.from(at),Timestamp.from(at),Timestamp.from(at),Timestamp.from(at)).isEmpty())throw new PrivacyFailure("NOT_FOUND");}
 private Optional<Row> find(UUID source,UUID id){return jdbc.query("SELECT *,original_response::text AS original,cancel_response::text AS cancel_original FROM privacy_redaction_metadata WHERE id=? AND case_id=?",(r,n)->new Row(id,source,r.getObject("organization_id",UUID.class),r.getString("country"),r.getString("scope_policy"),r.getLong("revision"),r.getString("state"),r.getString("outcome"),(Boolean)r.getObject("field_changed"),r.getTimestamp("created_at").toInstant(),r.getTimestamp("approval_expires_at").toInstant(),instant(r,"resolved_at"),instant(r,"completed_at"),r.getString("original"),r.getString("cancel_original"),(Long)r.getObject("resolution_from_revision")),id,source).stream().findFirst();}
 private View view(Row r){return new View(r.id(),r.source(),r.organization(),r.country(),r.scope(),r.state(),revision(r.id(),r.revision()),time(r.created()),time(r.expires()),r.outcome(),r.changed(),time(r.resolved()),time(r.completed()),false);}
 private static void check(String code){if(!Set.of("OK","REPLAY").contains(code))throw new PrivacyFailure(code);}
 private String revision(UUID id,long revision){return revisions.getObject().encode("redaction/v1",id,revision);}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
 private static Instant instant(ResultSet r,String name)throws SQLException{var t=r.getTimestamp(name);return t==null?null:t.toInstant();}
 private static String time(Instant t){return t==null?null:new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(t);}
 private static byte[] digest(Object value){try{return MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(value));}catch(NoSuchAlgorithmException e){throw new IllegalStateException("Digest unavailable");}}
 private UUID requestId(){String text=MDC.get("requestId");try{var id=UUID.fromString(text);if(id.version()!=7||id.variant()!=2)throw new IllegalArgumentException();return id;}catch(IllegalArgumentException|NullPointerException e){return ids.next();}}
 private record Row(UUID id,UUID source,UUID organization,String country,String scope,long revision,String state,String outcome,Boolean changed,Instant created,Instant expires,Instant resolved,Instant completed,String original,String cancelOriginal,Long resolutionFrom){}
}
