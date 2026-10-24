package com.narudzbine.audit.infrastructure;
import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import java.security.*;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcPrivateCaseReview implements PrivateCaseReview {
 private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;private final SecureRandom random=new SecureRandom();
 public JdbcPrivateCaseReview(JdbcTemplate jdbc,Clock clock,UuidGenerator ids){this.jdbc=jdbc;this.clock=clock;this.ids=ids;}
 public Optional<Target> route(UUID id){return jdbc.query("SELECT organization_id,country FROM privacy_case_metadata WHERE id=?",(r,n)->new Target(r.getObject(1,UUID.class),r.getString(2)),id).stream().findFirst();}
 public long qualify(UUID actor){return jdbc.queryForList("SELECT revision FROM privacy_operator WHERE account_id=? AND enabled FOR SHARE",Long.class,actor).stream().findFirst().orElseThrow(()->new PrivacyFailure("NOT_FOUND"));}
 public Access authorize(UUID caseId,Target target,Actor actor,Context context){
  long revision=qualify(actor.account());Instant at=now(),expires=at.plusSeconds(60);UUID id=ids.next();byte[] nonce=new byte[32];random.nextBytes(nonce);
  audit(id,actor.account(),caseId,target,"PRIVACY_REVIEW_AUTHORIZED",context.reason(),at);
  int inserted=jdbc.update("""
   INSERT INTO privacy_review_access(id,case_id,organization_id,country,actor_id,session_id,transport,qualification_revision,security_epoch,credential_generation,session_token_hash,nonce_hash,reason,case_reference,created_at,expires_at)
   SELECT ?,?,?,?,?,s.id,s.transport,?,a.security_epoch,a.credential_generation,s.token_hash,?,?,?,?,?
   FROM application_session s JOIN account_identity a ON a.id=s.account_id WHERE s.id=? AND s.account_id=? AND s.transport=?
   """,id,caseId,target.organization(),target.country(),actor.account(),revision,hash(nonce),context.reason(),context.caseReference(),Timestamp.from(at),Timestamp.from(expires),actor.session(),actor.account(),actor.transport());
  if(inserted!=1)throw new PrivacyFailure("NOT_FOUND");return new Access(id,caseId,target,actor,nonce,expires);
 }
 public Result disclose(Access access){
  qualify(access.actor().account());Instant at=now();var rows=jdbc.query("SELECT * FROM public.read_privacy_review(?,?,?,?,?,?)",(r,n)->new Result(r.getObject("id",UUID.class),r.getObject("organization_id",UUID.class),r.getString("country"),r.getString("kind"),r.getObject("requester_id",UUID.class),r.getString("private_reason"),time(r.getTimestamp("created_at").toInstant()),access.id()),access.id(),access.nonce(),access.actor().account(),access.actor().session(),access.actor().transport(),Timestamp.from(at));
  if(rows.size()!=1||!clock.instant().isBefore(access.expires()))throw new PrivacyFailure("NOT_FOUND");var value=rows.getFirst();if(!value.id().equals(access.caseId())||!value.organizationId().equals(access.target().organization())||!value.country().equals(access.target().country()))throw new PrivacyFailure("NOT_FOUND");UUID audit=ids.next();audit(audit,access.actor().account(),access.caseId(),access.target(),"PRIVACY_CASE_PRIVATE_READ",null,at);jdbc.update("INSERT INTO privacy_review_read(audit_id,access_id) VALUES(?,?)",audit,access.id());return value;
 }
 private void audit(UUID id,UUID actor,UUID resource,Target target,String action,String reason,Instant at){jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,reason,changed_fields,target_organization_id,target_country) VALUES(?,'PLATFORM_ADMIN',?,?,'PRIVACY_CASE',?,'SUCCESS',?,?,?,ARRAY['privateRequest'],?,?)",id,actor,action,resource,requestId(),Timestamp.from(at),reason,target.organization(),target.country());}
 private UUID requestId(){String value=MDC.get("requestId");if(value!=null)try{UUID id=UUID.fromString(value);if(id.version()==7&&id.variant()==2)return id;}catch(IllegalArgumentException ignored){}return ids.next();}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
 private static String time(Instant at){return new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(at);}
 private static byte[] hash(byte[] nonce){try{return MessageDigest.getInstance("SHA-256").digest(nonce);}catch(NoSuchAlgorithmException impossible){throw new IllegalStateException("Digest unavailable");}}
}
