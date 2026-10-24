package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Source transactions end before independent I/O. Receipts acknowledge only the fixed captured run. */
public final class AuditArchiveWorker {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final JdbcTemplate jdbc;private final IndependentEvidence evidence;private final Clock clock;private final UuidGenerator ids;private final UUID policy;
    private final TransactionTemplate command,snapshot;private final Semaphore slot=new Semaphore(1);
    public AuditArchiveWorker(JdbcTemplate jdbc,PlatformTransactionManager manager,IndependentEvidence evidence,Clock clock,UuidGenerator ids,UUID policy){
        this.jdbc=jdbc;this.evidence=evidence;this.clock=clock;this.ids=ids;this.policy=policy;command=new TransactionTemplate(manager);command.setTimeout(10);
        snapshot=new TransactionTemplate(manager);snapshot.setReadOnly(true);snapshot.setTimeout(10);snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }
    public int tick(){
        IndependentEvidence.outside();if(!slot.tryAcquire())return 0;
        try{
            UUID id=command.execute(s->jdbc.queryForObject("SELECT claim_audit_archive(?,?,?)",UUID.class,policy,ids.next(),Timestamp.from(now())));if(id==null)return 0;
            var prepared=snapshot.execute(s->prepare(id));var run=prepared.run();
            if(run.state().equals("PENDING")){
                var receipt=evidence.ensure(key(IndependentObjects.Family.AUDIT_PART,id),prepared.part());ack(id,"PART",receipt);
                run=snapshot.execute(s->read(id));
            }
            if(run.state().equals("PART_VERIFIED")){
                var partKey=key(IndependentObjects.Family.AUDIT_PART,id);evidence.require(partKey,new IndependentEvidence.Receipt(partKey,run.partVersion(),run.partDigest(),run.partBytes()));
                byte[] manifest=JSON.writeValueAsBytes(new Manifest(1,run.id(),run.policy(),run.policyRevision(),run.date(),time(run.created()),time(run.cutoff()),false,"COMMITTED_VISIBLE_BEFORE_CUTOFF",run.records(),new PartReference(key(IndependentObjects.Family.AUDIT_PART,id).path(),run.partDigest(),run.partBytes(),run.partVersion())));
                var receipt=evidence.ensure(key(IndependentObjects.Family.AUDIT_MANIFEST,id),manifest);ack(id,"MANIFEST",receipt);
            }
            return 1;
        }finally{slot.release();}
    }
    private Prepared prepare(UUID id){
        var run=read(id);if(!run.state().equals("PENDING"))return new Prepared(run,null);
        var bounds=jdbc.queryForMap("SELECT count(*) AS records,coalesce(sum(source_upper_bound),0) AS bytes FROM audit_archive_source WHERE run_id=?",id);
        if(((Number)bounds.get("records")).intValue()!=run.records())throw new EvidenceFailure("EVIDENCE_SOURCE_MISMATCH");
        if(((Number)bounds.get("bytes")).longValue()>IndependentObjects.MAX_PLAINTEXT-4096)throw new EvidenceFailure("EVIDENCE_SIZE_LIMIT");
        var rows=jdbc.query("SELECT * FROM audit_archive_source WHERE run_id=? ORDER BY id",(r,n)->{
            var array=r.getArray("changed_fields");List<String> fields;try{fields=Collections.unmodifiableList(new ArrayList<>(Arrays.asList((String[])array.getArray())));}finally{array.free();}
            return new Event(r.getObject("id",UUID.class),r.getString("actor_type"),r.getObject("actor_id",UUID.class),r.getObject("organization_id",UUID.class),r.getString("country"),r.getString("action"),r.getString("resource_type"),r.getObject("resource_id",UUID.class),r.getString("outcome"),r.getObject("request_id",UUID.class),time(r.getTimestamp("occurred_at").toInstant()),fields,r.getString("reason"),r.getObject("target_organization_id",UUID.class),r.getString("target_country"));
        },id);
        if(rows.size()!=run.records())throw new EvidenceFailure("EVIDENCE_SOURCE_MISMATCH");
        byte[] body=JSON.writeValueAsBytes(new Part(1,run.id(),run.policy(),run.policyRevision(),run.date(),time(run.created()),time(run.cutoff()),rows));
        if(body.length>IndependentObjects.MAX_PLAINTEXT)throw new EvidenceFailure("EVIDENCE_SIZE_LIMIT");return new Prepared(run,body);
    }
    private Run read(UUID id){return jdbc.query("SELECT * FROM audit_archive_work WHERE id=?",(r,n)->new Run(id,r.getObject("policy_id",UUID.class),r.getLong("policy_revision"),r.getObject("archive_date",LocalDate.class).toString(),r.getTimestamp("created_at").toInstant(),r.getTimestamp("cutoff").toInstant(),r.getString("state"),r.getInt("record_count"),r.getString("part_sha256"),(Integer)r.getObject("part_bytes"),r.getString("part_key_version")),id).stream().findFirst().orElseThrow(()->new EvidenceFailure("EVIDENCE_SOURCE_MISMATCH"));}
    private void ack(UUID id,String kind,IndependentEvidence.Receipt receipt){boolean result=command.execute(s->Boolean.TRUE.equals(jdbc.queryForObject("SELECT acknowledge_audit_archive(?,?,?,?,?,?)",Boolean.class,id,kind,receipt.ciphertextSha256(),receipt.bytes(),receipt.keyVersion(),Timestamp.from(now()))));if(!result)throw new EvidenceFailure("EVIDENCE_RECEIPT_CONFLICT");}
    private static IndependentObjects.Key key(IndependentObjects.Family family,UUID id){return new IndependentObjects.Key(family,id,1);}
    private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
    private static String time(Instant value){return new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(value);}
    private record Run(UUID id,UUID policy,long policyRevision,String date,Instant created,Instant cutoff,String state,int records,String partDigest,Integer partBytes,String partVersion){}
    private record Prepared(Run run,byte[] part){@Override public String toString(){return "PreparedArchive[redacted]";}}
    private record Event(UUID id,String actorType,UUID actorId,UUID organizationId,String country,String action,String resourceType,UUID resourceId,String outcome,UUID requestId,String occurredAt,List<String> changedFields,String reason,UUID targetOrganizationId,String targetCountry){@Override public String toString(){return "ArchiveEvent[redacted]";}}
    private record Part(int version,UUID runId,UUID policyId,long policyRevision,String archiveDate,String snapshotAt,String eligibleBefore,List<Event> events){@Override public String toString(){return "ArchivePart[redacted]";}}
    private record PartReference(String objectPath,String ciphertextSha256,int bytes,String keyVersion){}
    private record Manifest(int version,UUID runId,UUID policyId,long policyRevision,String archiveDate,String snapshotAt,String eligibleBefore,boolean dayFinal,String scope,int records,PartReference part){}
}
