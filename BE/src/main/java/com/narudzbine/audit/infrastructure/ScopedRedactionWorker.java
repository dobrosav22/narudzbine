package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** One explicitly selected scoped job. No server bean/scheduler, raw source read or whole-case erasure claim. */
public final class ScopedRedactionWorker {
    private static final JsonMapper JSON=JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final IndependentEvidence evidence;
    private final ManagedIdentityContainment identity;
    private final Clock clock;
    private final UuidGenerator ids;
    private final String environment,configuration;
    private final Semaphore slot=new Semaphore(1);
    public record Result(UUID jobId,UUID caseId,String state,String outcome,boolean wholeCaseFulfillment,Map<String,Long> affectedCounts){}
    public ScopedRedactionWorker(JdbcTemplate jdbc,PlatformTransactionManager manager,IndependentEvidence evidence,Clock clock,UuidGenerator ids,String environment,String configuration){this(jdbc,manager,evidence,clock,ids,environment,configuration,null);}
    public ScopedRedactionWorker(JdbcTemplate jdbc,PlatformTransactionManager manager,IndependentEvidence evidence,Clock clock,UuidGenerator ids,String environment,String configuration,ManagedIdentityContainment identity){
        this.jdbc=jdbc;this.tx=new TransactionTemplate(manager);tx.setTimeout(10);this.evidence=evidence;this.identity=identity;this.clock=clock;this.ids=ids;this.environment=environment;this.configuration=configuration;
    }
    public Result run(UUID id,boolean completionOnly){
        IndependentEvidence.outside();if(!slot.tryAcquire())throw new EvidenceFailure("WORKER_BUSY");
        try{
            var job=readCommitted(id);validateIntent(job);
            if(completionOnly&&!Set.of("APPLIED","CANCELLED","COMPLETED").contains(job.state()))throw new EvidenceFailure("SOURCE_NOT_RESOLVED");
            if(job.state().equals("COMPLETED")){validateCompletion(job);var intentKey=key(IndependentObjects.Family.DELETION_INTENT,job);evidence.require(intentKey,job.intent(),new IndependentEvidence.Receipt(intentKey,job.intentVersion(),job.intentDigest(),job.intentBytes()));var completeKey=key(IndependentObjects.Family.DELETION_COMPLETION,job);evidence.require(completeKey,job.completion(),new IndependentEvidence.Receipt(completeKey,job.completionVersion(),job.completionDigest(),job.completionBytes()));return result(job);}
            var intentKey=key(IndependentObjects.Family.DELETION_INTENT,job);
            var receipt=job.intentDigest()==null?evidence.ensure(intentKey,job.intent()):evidence.require(intentKey,job.intent(),new IndependentEvidence.Receipt(intentKey,job.intentVersion(),job.intentDigest(),job.intentBytes()));
            acknowledge(id,"INTENT",receipt);job=readCommitted(id);
            if(job.state().equals("INTENT_VERIFIED")&&job.scope().equals("ACCOUNT_EMAIL_V1")){
                if(identity==null)throw new EvidenceFailure("IDENTITY_VERIFIER_REQUIRED");
                if(!now().isBefore(job.expires()))throw new EvidenceFailure("AUTHORIZATION_EXPIRED");
                var expected=job.identitySubject();var observed=identity.verify(expected).orElseThrow(()->new EvidenceFailure("IDENTITY_CONTAINMENT_UNVERIFIED"));
                if(!expected.equals(observed.subject())||observed.state()==null||observed.observedAt()==null)throw new EvidenceFailure("IDENTITY_CONTAINMENT_UNVERIFIED");
                String code=tx.execute(t->jdbc.queryForObject("SELECT acknowledge_identity_containment(?,?,?,?,?)",String.class,ids.next(),id,observed.state().name(),Timestamp.from(observed.observedAt()),Timestamp.from(now())));
                if(!Set.of("OK","RESOLVED").contains(code))throw new EvidenceFailure(code);
                job=readCommitted(id);
            }
            if(job.state().equals("INTENT_VERIFIED")){
                Instant deadline=job.expires();
                String code=tx.execute(s->{String result=jdbc.queryForObject("SELECT apply_scoped_redaction(?,?,?,?)",String.class,id,ids.next(),ids.next(),Timestamp.from(now()));if("OK".equals(result)&&!now().isBefore(deadline))throw new EvidenceFailure("AUTHORIZATION_EXPIRED");return result;});
                if(!Set.of("OK","RESOLVED").contains(code))throw new EvidenceFailure(code);
                job=readCommitted(id);
            }
            if(Set.of("APPLIED","CANCELLED").contains(job.state())){
                validateCompletion(job);
                var completed=evidence.ensure(key(IndependentObjects.Family.DELETION_COMPLETION,job),job.completion());
                acknowledge(id,"COMPLETION",completed);job=readCommitted(id);
            }
            if(!job.state().equals("COMPLETED"))throw new EvidenceFailure("SOURCE_NOT_RESOLVED");return result(job);
        }finally{slot.release();}
    }
    private Work readCommitted(UUID id){return tx.execute(s->{
        var rows=jdbc.query("SELECT * FROM privacy_redaction_worker_work WHERE id=?",(r,n)->new Work(r.getObject("id",UUID.class),r.getObject("case_id",UUID.class),r.getObject("organization_id",UUID.class),r.getString("country"),r.getObject("requester_id",UUID.class),r.getInt("generation"),r.getString("scope_policy"),r.getLong("expected_profile_revision"),r.getString("environment_code"),r.getString("configuration_reference"),r.getString("state"),r.getString("outcome"),r.getBytes("intent_body"),r.getBytes("completion_body"),r.getString("intent_sha256"),(Integer)r.getObject("intent_bytes"),r.getString("intent_key_version"),r.getString("completion_sha256"),(Integer)r.getObject("completion_bytes"),r.getString("completion_key_version"),r.getTimestamp("approval_expires_at").toInstant(),r.getString("source_manifest"),r.getString("affected_counts"),r.getObject("provider_tenant_id",UUID.class),r.getObject("provider_user_id",UUID.class),r.getString("provider_endpoint"),r.getString("provider_conformance_reference"),r.getBoolean("provider_absence_allowed"),r.getString("identity_observation")),id);
        if(rows.size()!=1)throw new EvidenceFailure("SOURCE_NOT_COMMITTED");var work=rows.getFirst();if(!environment.equals(work.environment())||!configuration.equals(work.configuration()))throw new EvidenceFailure("SOURCE_ENVIRONMENT_MISMATCH");return work;
    });}
    private void acknowledge(UUID id,String kind,IndependentEvidence.Receipt receipt){String code=tx.execute(s->jdbc.queryForObject("SELECT acknowledge_scoped_redaction(?,?,?,?,?,?)",String.class,id,kind,receipt.ciphertextSha256(),receipt.bytes(),receipt.keyVersion(),Timestamp.from(now())));if(!"OK".equals(code))throw new EvidenceFailure(code);}
    private void validateIntent(Work job){try{
        var value=JSON.readValue(job.intent(),Intent.class);boolean names="REQUESTER_NAMES_V1".equals(job.scope()),email="ACCOUNT_EMAIL_V1".equals(job.scope());
        if(value.version()!=1||!job.id().equals(value.planId())||!job.source().equals(value.caseId())||job.sequence()!=value.sequence()||!job.organization().equals(value.organizationId())||!job.country().equals(value.country())||!job.subject().equals(value.subjectAccountId())||job.profileRevision()!=value.expectedProfileRevision()||!Set.of("ACCOUNT_DISPLAY_NAME_V1","REQUESTER_NAMES_V1","ACCOUNT_EMAIL_V1").contains(value.scopePolicy())||!job.scope().equals(value.scopePolicy())||!(email?"PSEUDONYMIZE_LOGIN_EMAIL":names?"PSEUDONYMIZE_REQUESTER_NAMES":"PSEUDONYMIZE_DISPLAY_NAME").equals(value.fieldAction())||!(email?"retired+"+job.subject()+"@accounts.invalid":"[redacted]").equals(value.replacement())||value.wholeCaseFulfillment()||value.approvedBy()==null||value.reviewAuthorizationId()==null||value.approvalAuditId()==null||value.references()==null)throw new IllegalArgumentException();
        if(names){
            if(value.sourceManifest()==null||value.sourceManifest().size()>100000||!JSON.readTree(JSON.writeValueAsBytes(value.sourceManifest())).equals(JSON.readTree(job.manifest())))throw new IllegalArgumentException();
            for(var entry:value.sourceManifest())if(!Set.of("purchase_order","purchase_order_event","order_submission_replay","order_stage_assignment","order_message","message_replay").contains(entry.family())||entry.identity()==null||entry.identity().isEmpty()||entry.orderId()==null||entry.buyerId()==null||entry.vendorId()==null||entry.sourceRevision()<1||!Set.of(entry.buyerId(),entry.vendorId()).contains(job.organization()))throw new IllegalArgumentException();
        }else if(value.sourceManifest()!=null)throw new IllegalArgumentException();
        if(email){if(value.identitySource()==null||!value.identitySource().equals(new IdentitySource(job.tenant(),job.providerUser(),job.endpoint(),job.conformance(),job.allowAbsence())))throw new IllegalArgumentException();}
        else if(value.identitySource()!=null)throw new IllegalArgumentException();
    }catch(RuntimeException invalid){throw new EvidenceFailure("EVIDENCE_SOURCE_MISMATCH");}}
    private void validateCompletion(Work job){try{
        if(job.completion()==null)throw new IllegalArgumentException();var value=JSON.readValue(job.completion(),Completion.class);
        if(value.version()!=1||!job.id().equals(value.planId())||!job.source().equals(value.caseId())||job.sequence()!=value.sequence()||!job.organization().equals(value.organizationId())||!job.country().equals(value.country())||!job.scope().equals(value.scopePolicy())||!job.outcome().equals(value.outcome())||!Objects.equals(job.intentDigest(),value.intentCiphertextSha256())||value.resolutionActorId()==null||value.resolutionAuditId()==null||value.wholeCaseFulfillment())throw new IllegalArgumentException();
        if(!Objects.equals(value.identityObservation()==null?null:JSON.readTree(JSON.writeValueAsBytes(value.identityObservation())),job.observation()==null?null:JSON.readTree(job.observation())))throw new IllegalArgumentException();
        if(!Objects.equals(value.affectedCounts()==null?null:JSON.readTree(JSON.writeValueAsBytes(value.affectedCounts())),job.counts()==null?null:JSON.readTree(job.counts())))throw new IllegalArgumentException();
    }catch(RuntimeException invalid){throw new EvidenceFailure("EVIDENCE_SOURCE_MISMATCH");}}
    private static IndependentObjects.Key key(IndependentObjects.Family family,Work job){return new IndependentObjects.Key(family,job.source(),job.sequence());}
    private static Result result(Work job){return new Result(job.id(),job.source(),job.state(),job.outcome(),false,job.counts()==null?null:Map.copyOf(JSON.readValue(job.counts(),new tools.jackson.core.type.TypeReference<Map<String,Long>>(){})));}
    private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
    private record Work(UUID id,UUID source,UUID organization,String country,UUID subject,int sequence,String scope,long profileRevision,String environment,String configuration,String state,String outcome,byte[] intent,byte[] completion,String intentDigest,Integer intentBytes,String intentVersion,String completionDigest,Integer completionBytes,String completionVersion,Instant expires,String manifest,String counts,UUID tenant,UUID providerUser,String endpoint,String conformance,boolean allowAbsence,String observation){ManagedIdentityContainment.Subject identitySubject(){return new ManagedIdentityContainment.Subject(tenant,providerUser,endpoint,conformance,allowAbsence);}@Override public String toString(){return "ScopedRedactionWork[redacted]";}}
    private record ManifestEntry(String family,Map<String,Object> identity,UUID orderId,UUID buyerId,UUID vendorId,long sourceRevision){@Override public String toString(){return "NameManifestEntry[redacted]";}}
    private record IdentitySource(UUID tenantId,UUID userId,String endpoint,String conformanceReference,boolean allowAbsence){@Override public String toString(){return "IdentitySource[redacted]";}}
    private record IdentityObservation(UUID id,String state,String observedAt,UUID tenantId,UUID userId,String endpoint,String conformanceReference,boolean allowAbsence){@Override public String toString(){return "IdentityObservation[redacted]";}}
    private record References(String requesterVerification,String legalApplicability,String containment,String retainedScope){}
    private record Intent(int version,UUID planId,UUID caseId,int sequence,UUID organizationId,String country,UUID subjectAccountId,String scopePolicy,long expectedProfileRevision,String fieldAction,String replacement,UUID approvedBy,long qualificationRevision,UUID reviewAuthorizationId,UUID approvalAuditId,String approvedAt,References references,boolean wholeCaseFulfillment,List<ManifestEntry> sourceManifest,IdentitySource identitySource){@Override public String toString(){return "DeletionIntent[redacted]";}}
    private record Completion(int version,UUID planId,UUID caseId,int sequence,UUID organizationId,String country,String scopePolicy,String outcome,UUID resolutionActorId,UUID resolutionAuditId,String resolvedAt,Long profileRevisionAfter,Boolean fieldChanged,String intentCiphertextSha256,boolean wholeCaseFulfillment,Map<String,Long> affectedCounts,IdentityObservation identityObservation){@Override public String toString(){return "DeletionCompletion[redacted]";}}
}
