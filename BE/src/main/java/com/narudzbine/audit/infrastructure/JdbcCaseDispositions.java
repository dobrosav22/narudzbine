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
public class JdbcCaseDispositions implements CaseDispositions {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private final JdbcTemplate jdbc;private final PrivateCaseReview operators;private final ObjectProvider<ResourceRevisions> revisions;private final Clock clock;private final UuidGenerator ids;
 public JdbcCaseDispositions(JdbcTemplate jdbc,PrivateCaseReview operators,ObjectProvider<ResourceRevisions> revisions,Clock clock,UuidGenerator ids){this.jdbc=jdbc;this.operators=operators;this.revisions=revisions;this.clock=clock;this.ids=ids;}
 public View record(PrivateCaseReview.Access access,Command command){
  operators.qualify(access.actor().account());if(!operators.route(access.caseId()).orElseThrow(()->new PrivacyFailure("NOT_FOUND")).equals(access.target()))throw new PrivacyFailure("NOT_FOUND");
  validate(command);var old=find(access.caseId(),command.id());long expected=1;
  if(old.isEmpty()){expected=jdbc.queryForObject("SELECT coalesce((SELECT revision FROM privacy_redaction_fulfillment_metadata WHERE case_id=?),1)",Long.class,access.caseId());if(!revisions.getObject().matches("privacy/v1",access.caseId(),expected,command.expectedCaseRevision()))throw new PrivacyFailure("REVISION_MISMATCH");}
  var at=now();var view=new View(command.id(),access.caseId(),access.target().organization(),access.target().country(),command.resolveCase()?"COMPLETED":"REVIEWING",revisions.getObject().encode("privacy/v1",access.caseId(),expected+1),time(at),command.resolveCase(),false,command.items());
  byte[] digest=digest(List.of(access.caseId(),command.id(),command.expectedCaseRevision(),command.items(),command.resolveCase(),command.acceptRetainedScope(),command.references(),command.context()));
  String code=jdbc.queryForObject("SELECT record_case_disposition(?,?,?,?,?,?,?,?::jsonb,?,?,?::jsonb,?,?::jsonb,?,?,?)",String.class,command.id(),access.id(),access.nonce(),access.actor().account(),access.actor().session(),access.actor().transport(),expected,JSON.writeValueAsString(command.items()),command.resolveCase(),command.acceptRetainedScope(),JSON.writeValueAsString(command.references()),digest,JSON.writeValueAsString(view),ids.next(),requestId(),Timestamp.from(at));
  if(!Set.of("OK","REPLAY").contains(code))throw new PrivacyFailure(code,"REPLAY_EXPIRED".equals(code)?command.id():null);if(!clock.instant().isBefore(access.expires()))throw new PrivacyFailure("NOT_FOUND");return find(access.caseId(),command.id()).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));
 }
 public View read(PrivateCaseReview.Actor actor,UUID caseId,UUID id){operators.qualify(actor.account());current(actor);var view=find(caseId,id).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,target_organization_id,target_country) VALUES(?,'PLATFORM_ADMIN',?,'PRIVACY_DISPOSITION_READ','PRIVACY_CASE',?,'SUCCESS',?,?,ARRAY['disposition'],?,?)",ids.next(),actor.account(),caseId,requestId(),Timestamp.from(now()),view.organizationId(),view.country());return view;}
 private Optional<View> find(UUID source,UUID id){return jdbc.query("SELECT original_response::text FROM privacy_case_disposition_metadata WHERE case_id=? AND id=?",(r,n)->JSON.readValue(r.getString(1),View.class),source,id).stream().findFirst();}
 static void validate(Command command){
  if(command.id()==null||command.items().size()!=FAMILIES.size()||!command.items().stream().map(Item::family).collect(java.util.stream.Collectors.toSet()).equals(Set.copyOf(FAMILIES)))throw new PrivacyFailure("INVALID_DISPOSITION");
  for(var item:command.items()){
   if(item.reference()==null||!item.reference().matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}")||!Set.of("APPLIED","RETAINED","PENDING","REVIEWED_NO_ADDITIONAL_SCOPE").contains(item.disposition()))throw new PrivacyFailure("INVALID_DISPOSITION");
   boolean applied="APPLIED".equals(item.disposition()),additional="ADDITIONAL_SCOPE".equals(item.family());
   if(applied&&(!FAMILIES.subList(0,3).contains(item.family())||item.jobId()==null)||!applied&&item.jobId()!=null||additional&&!Set.of("PENDING","REVIEWED_NO_ADDITIONAL_SCOPE").contains(item.disposition())||!additional&&"REVIEWED_NO_ADDITIONAL_SCOPE".equals(item.disposition()))throw new PrivacyFailure("INVALID_DISPOSITION");
  }
  if(command.resolveCase()&&(!command.acceptRetainedScope()||command.items().stream().anyMatch(i->i.disposition().equals("PENDING"))))throw new PrivacyFailure("SCOPE_PENDING");
 }
 private void current(PrivateCaseReview.Actor actor){Instant at=now();if(jdbc.queryForList("SELECT a.id FROM account_identity a JOIN application_session s ON s.account_id=a.id WHERE a.id=? AND s.id=? AND s.transport=? AND a.kind='PLATFORM_ADMIN' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending AND s.revoked_at IS NULL AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation AND s.auth_at<=? AND ?<s.auth_at+interval '300 seconds' AND ?<s.absolute_expires_at AND ?<s.last_qualified_activity_at+interval '30 minutes' FOR SHARE OF a,s",UUID.class,actor.account(),actor.session(),actor.transport(),Timestamp.from(at),Timestamp.from(at),Timestamp.from(at),Timestamp.from(at)).isEmpty())throw new PrivacyFailure("NOT_FOUND");}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}private static String time(Instant at){return new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(at);}
 private static byte[] digest(Object value){try{return MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(value));}catch(NoSuchAlgorithmException impossible){throw new IllegalStateException("Digest unavailable");}}
 private UUID requestId(){try{var id=UUID.fromString(MDC.get("requestId"));if(id.version()==7&&id.variant()==2)return id;}catch(IllegalArgumentException|NullPointerException ignored){}return ids.next();}
}
