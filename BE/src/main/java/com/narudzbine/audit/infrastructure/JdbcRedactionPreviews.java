package com.narudzbine.audit.infrastructure;
import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service @Transactional(propagation=Propagation.MANDATORY)
public class JdbcRedactionPreviews implements RedactionPreviews {
 private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;private final PrivateCaseReview operators;
 public JdbcRedactionPreviews(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,PrivateCaseReview operators){this.jdbc=jdbc;this.clock=clock;this.ids=ids;this.operators=operators;}
 public Preview inspect(PrivateCaseReview.Access authorization){
  operators.qualify(authorization.actor().account());Instant at=clock.instant().truncatedTo(ChronoUnit.MILLIS);
  var rows=jdbc.query("SELECT * FROM inspect_redaction_preview(?,?,?,?,?,?)",(r,n)->new Source(r.getObject("requester_id",UUID.class),r.getObject("organization_id",UUID.class),r.getString("country"),r.getString("account_state"),r.getString("member_role"),r.getBoolean("credential_pending"),r.getLong("session_count"),r.getBoolean("hold_active"),r.getLong("submission_count"),r.getLong("event_count"),r.getLong("message_count"),r.getLong("contact_count"),r.getLong("location_count"),r.getLong("artifact_count"),r.getLong("audit_count")),authorization.id(),authorization.nonce(),authorization.actor().account(),authorization.actor().session(),authorization.actor().transport(),Timestamp.from(at));
  if(rows.size()!=1||!clock.instant().isBefore(authorization.expires()))throw new PrivacyFailure("NOT_FOUND");var source=rows.getFirst();if(!source.organization().equals(authorization.target().organization())||!source.country().equals(authorization.target().country()))throw new PrivacyFailure("NOT_FOUND");
  if(source.submissions()+source.events()+source.messages()+source.contacts()+source.locations()+source.artifacts()+source.audits()>100000)throw new PrivacyFailure("PREVIEW_TOO_LARGE");
  var fields=List.of(new FieldAction("ACCOUNT_IDENTITY","displayName","PSEUDONYMIZE",1),new FieldAction("ACCOUNT_IDENTITY","email","REPLACE_AFTER_IDENTITY_RECONCILIATION",1),new FieldAction("ORDER_SUBMISSION","submittedByDisplayName","REDACT_ATTRIBUTION",source.submissions()),new FieldAction("ORDER_EVENT","actorDisplayName","REDACT_ATTRIBUTION",source.events()),new FieldAction("ORDER_MESSAGE","authorDisplayName","REDACT_ATTRIBUTION",source.messages()));
  var retained=List.of(new RetainedFamily("PERMANENT_IDENTITY_AND_COMMERCIAL_TOTALS","UNDETERMINED",null,"PRESERVE_IDENTIFIERS_BINDINGS_AND_AMOUNTS"),new RetainedFamily("MESSAGE_TEXT","REQUESTER_ATTRIBUTION",source.messages(),"SHARED_CONTENT_LEGAL_REVIEW"),new RetainedFamily("ORDER_RESULTS_AND_REPLAY_COPIES","UNDETERMINED",null,"ATTRIBUTION_COPY_REVIEW"),new RetainedFamily("ORGANIZATION_CONTACTS","ORGANIZATION_INVENTORY",source.contacts(),"EXPLICIT_SUBJECT_ASSOCIATION_REQUIRED"),new RetainedFamily("ORGANIZATION_LOCATIONS","ORGANIZATION_INVENTORY",source.locations(),"EXPLICIT_SUBJECT_ASSOCIATION_REQUIRED"),new RetainedFamily("EXPORT_ARTIFACTS","ORGANIZATION_INVENTORY",source.artifacts(),"DERIVATIVE_AND_HOLD_REVIEW"),new RetainedFamily("ATTRIBUTABLE_AUDIT_ROWS","REQUESTER_ATTRIBUTION",source.audits(),"EVIDENCE_AND_HOLD_REVIEW"),new RetainedFamily("PROVIDER_AND_DELIVERY_COPIES","UNDETERMINED",null,"EXTERNAL_RECONCILIATION_REQUIRED"),new RetainedFamily("MEDIA_AND_OTHER_FREE_TEXT","UNDETERMINED",null,"EXPLICIT_SUBJECT_ASSOCIATION_REQUIRED"),new RetainedFamily("BACKUPS_AND_INDEPENDENT_ARCHIVES","UNDETERMINED",null,"INDEPENDENT_CUSTODY_AND_RETENTION_REVIEW"));
  var blockers=new ArrayList<String>();if(!source.state().equals("DEACTIVATED")||source.sessions()>0)blockers.add("AUTHENTICATION_CONTAINMENT_REQUIRED");if(source.role().equals("OWNER"))blockers.add("OWNER_TRANSFER_OR_REVIEW_REQUIRED");if(source.pending())blockers.add("CREDENTIAL_RECONCILIATION_REQUIRED");if(source.held())blockers.add("HOLD_ACTIVE");blockers.addAll(List.of("REQUESTER_AND_LEGAL_REVIEW_REQUIRED","SHARED_PROVIDER_AND_COPY_REVIEW_REQUIRED","EXECUTION_NOT_AVAILABLE"));
  UUID audit=ids.next();String request=MDC.get("requestId");UUID requestId;try{requestId=UUID.fromString(request);if(requestId.version()!=7||requestId.variant()!=2)throw new IllegalArgumentException();}catch(IllegalArgumentException|NullPointerException ignored){requestId=ids.next();}
  jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,target_organization_id,target_country) VALUES(?,'PLATFORM_ADMIN',?,'PRIVACY_REDACTION_PREVIEWED','PRIVACY_CASE',?,'SUCCESS',?,?,ARRAY['redactionPreview'],?,?)",audit,authorization.actor().account(),authorization.caseId(),requestId,Timestamp.from(at),source.organization(),source.country());jdbc.update("INSERT INTO privacy_review_read(audit_id,access_id) VALUES(?,?)",audit,authorization.id());
  if(!clock.instant().isBefore(authorization.expires()))throw new PrivacyFailure("NOT_FOUND");
  return new Preview(authorization.caseId(),source.organization(),source.country(),source.subject(),"REQUESTER_IDENTITY_V1",new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(at),authorization.id(),fields,retained,blockers,false);
 }
 private record Source(UUID subject,UUID organization,String country,String state,String role,boolean pending,long sessions,boolean held,long submissions,long events,long messages,long contacts,long locations,long artifacts,long audits){}
}
