package com.narudzbine.reporting.application;

import com.narudzbine.reporting.api.*;
import com.narudzbine.audit.api.ExportAudit;
import com.narudzbine.shared.api.ResourceRevisions;
import java.sql.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
public class JdbcExports implements Exports {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private static final DateTimeFormatter TIME=new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private static final String META="id,requester_id,organization_id,country,kind,from_date,to_date,created_at,revision,state,expires_at,failure_code,original_response::text AS original";
    private final JdbcTemplate jdbc;private final ExportSettings settings;private final org.springframework.beans.factory.ObjectProvider<ResourceRevisions> revisions;private final ExportAudit audit;private final Clock clock;
    public JdbcExports(JdbcTemplate jdbc,ExportSettings settings,org.springframework.beans.factory.ObjectProvider<ResourceRevisions> revisions,ExportAudit audit,Clock clock){this.jdbc=jdbc;this.settings=settings;this.revisions=revisions;this.audit=audit;this.clock=clock;}
    @Override @Transactional(propagation=Propagation.MANDATORY)
    public void compactExpiredCreations(){jdbc.update("WITH expired AS(SELECT id FROM commercial_export WHERE original_response IS NOT NULL AND created_at<=? ORDER BY created_at,id LIMIT 1000 FOR UPDATE SKIP LOCKED) UPDATE commercial_export p SET original_response=NULL FROM expired e WHERE p.id=e.id",Timestamp.from(now().minus(Duration.ofDays(7))));}
    @Override @Transactional(propagation=Propagation.MANDATORY)
    public View create(Scope scope,Command command){
        settings.envelope();var existing=find(command.id(),false);if(existing.isPresent())return replay(scope,command,existing.get());
        if(!settings.accepting())throw new ExportFailure("SERVICE_UNAVAILABLE");
        if(jdbc.queryForObject("SELECT count(*) FROM commercial_export WHERE requester_id=? AND state='QUEUED' AND created_at>?",Long.class,scope.requester(),Timestamp.from(now().minus(Duration.ofHours(24))))>=3)throw new ExportFailure("EXPORT_LIMIT_REACHED");
        var original=new View(command.id(),revisions.getObject().encode("export/v1",command.id(),1),"QUEUED",null,null);
        int inserted=jdbc.update("INSERT INTO commercial_export(id,requester_id,organization_id,country,kind,from_date,to_date,created_at,revision,state,original_response) VALUES(?,?,?,?,?,?,?,?,1,'QUEUED',?::jsonb) ON CONFLICT(id) DO NOTHING",
                command.id(),scope.requester(),scope.organization(),scope.country(),command.kind(),command.from(),command.to(),Timestamp.from(now()),JSON.writeValueAsString(original));
        if(inserted==0)return replay(scope,command,find(command.id(),false).orElseThrow(()->new ExportFailure("SERVICE_UNAVAILABLE")));
        audit.exportCreated(scope.requester(),command.id());return original;
    }
    private View replay(Scope scope,Command command,Job row){
        requireOwn(scope,row);
        if(!command.kind().equals(row.kind())||!command.from().equals(row.from())||!command.to().equals(row.to()))throw new ExportFailure("IDEMPOTENCY_MISMATCH");
        if(!now().isBefore(row.created().plus(Duration.ofDays(7))))throw new ExportFailure("REPLAY_EXPIRED",row.id());
        return JSON.readValue(row.original(),View.class);
    }
    @Override @Transactional(propagation=Propagation.MANDATORY)
    public View read(Scope scope,UUID id){settings.envelope();Job row=owned(scope,id);return view(expire(row));}
    @Override @Transactional(propagation=Propagation.MANDATORY)
    public Content download(Scope scope,UUID id){
        settings.envelope();Job row=expire(owned(scope,id));
        if(!row.state().equals("READY"))return new Content(null,row.state().equals("EXPIRED")?"EXPORT_EXPIRED":"INVALID_STATE");
        var body=jdbc.queryForMap("SELECT artifact,digest,byte_count FROM commercial_export WHERE id=?",id);
        byte[] plain;
        try {plain=settings.envelope().decrypt(id,(byte[])body.get("artifact"));if(plain.length!=((Number)body.get("byte_count")).intValue()||!MessageDigest.isEqual(digest(plain),(byte[])body.get("digest")))return new Content(null,"SERVICE_UNAVAILABLE");}
        catch(IllegalArgumentException e){return new Content(null,"SERVICE_UNAVAILABLE");}
        if(!expire(row).state().equals("READY"))return new Content(null,"EXPORT_EXPIRED");
        audit.exportDownloaded(scope.requester(),id);return new Content(plain,null);
    }
    private Job owned(Scope scope,UUID id){var row=jdbc.query("SELECT "+META+" FROM commercial_export WHERE id=? AND requester_id=? AND organization_id=? AND country=? FOR UPDATE",JdbcExports::map,id,scope.requester(),scope.organization(),scope.country()).stream().findFirst().orElseThrow(()->new ExportFailure("NOT_FOUND"));requireOwn(scope,row);return row;}
    private static void requireOwn(Scope scope,Job row){if(!scope.requester().equals(row.actor())||!scope.organization().equals(row.organization())||!scope.country().equals(row.country())||row.kind().equals("REPORT_BUYERS")&&!scope.vendor())throw new ExportFailure("NOT_FOUND");}
    Optional<Job> find(UUID id,boolean lock){return jdbc.query("SELECT "+META+" FROM commercial_export WHERE id=?"+(lock?" FOR UPDATE":""),JdbcExports::map,id).stream().findFirst();}
    Optional<Job> next(){return jdbc.query("SELECT "+META+" FROM commercial_export WHERE state='QUEUED' AND NOT EXISTS(SELECT 1 FROM account_identity a WHERE a.id=commercial_export.requester_id AND a.credential_operation_pending) ORDER BY created_at,id LIMIT 1",JdbcExports::map).stream().findFirst();}
    Optional<Job> lock(UUID id){return jdbc.query("SELECT "+META+" FROM commercial_export WHERE id=? AND state='QUEUED' FOR UPDATE SKIP LOCKED",JdbcExports::map,id).stream().findFirst();}
    Job expire(Job row){
        Instant at=now();boolean ready=row.state().equals("READY")&&!at.isBefore(row.expires()),queued=row.state().equals("QUEUED")&&!at.isBefore(row.created().plus(Duration.ofHours(24)));
        if(ready&&Boolean.TRUE.equals(jdbc.queryForObject("SELECT public.retention_preservation_active()",Boolean.class))){jdbc.update("UPDATE commercial_export SET state='EXPIRED',revision=revision+1,artifact_held=true WHERE id=?",row.id());return find(row.id(),false).orElseThrow();}
        if(ready||queued){jdbc.update("UPDATE commercial_export SET state='EXPIRED',revision=revision+1,artifact=NULL,digest=NULL,expires_at=coalesce(expires_at,created_at+interval '24 hours') WHERE id=?",row.id());return find(row.id(),false).orElseThrow();}return row;
    }
    void ready(Job row,byte[] csv,int rows){
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended('commercial-export/storage',0))");
        Instant at=now();if(!at.isBefore(row.created().plus(Duration.ofHours(24)))){expire(row);return;}
        long used=jdbc.queryForObject("SELECT coalesce(sum(octet_length(artifact)::bigint),0) FROM commercial_export WHERE artifact IS NOT NULL",Long.class);
        if(used+csv.length+28>128L*1024*1024){failed(row,"EXPORT_CAPACITY_REACHED");return;}
        jdbc.update("UPDATE commercial_export SET state='READY',revision=revision+1,artifact=?,digest=?,byte_count=?,row_count=?,completed_at=?,expires_at=?,failure_code=NULL WHERE id=? AND state='QUEUED'",
            settings.envelope().encrypt(row.id(),csv),digest(csv),csv.length,rows,Timestamp.from(at),Timestamp.from(at.plus(Duration.ofHours(24))),row.id());}
    void failed(Job row,String code){jdbc.update("UPDATE commercial_export SET state='FAILED',revision=revision+1,completed_at=?,failure_code=? WHERE id=? AND state='QUEUED'",Timestamp.from(now()),code,row.id());}
    int sweep(){
        if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT public.retention_preservation_active()",Boolean.class)))jdbc.update("WITH due AS(SELECT id FROM commercial_export WHERE artifact_held ORDER BY id LIMIT 25 FOR UPDATE SKIP LOCKED) UPDATE commercial_export e SET artifact=NULL,digest=NULL,artifact_held=false FROM due d WHERE e.id=d.id");
        var rows=jdbc.query("SELECT "+META+" FROM commercial_export WHERE(state='READY' AND expires_at<=?) OR(state='QUEUED' AND created_at<=?) ORDER BY created_at,id LIMIT 25 FOR UPDATE SKIP LOCKED",JdbcExports::map,Timestamp.from(now()),Timestamp.from(now().minus(Duration.ofHours(24))));rows.forEach(this::expire);return rows.size();
    }
    private View view(Job row){return new View(row.id(),revisions.getObject().encode("export/v1",row.id(),row.revision()),row.state(),row.expires()==null?null:TIME.format(row.expires()),row.failure());}
    Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
    private static byte[] digest(byte[] value){try{return MessageDigest.getInstance("SHA-256").digest(value);}catch(NoSuchAlgorithmException e){throw new IllegalStateException("SHA-256 unavailable");}}
    private static Job map(ResultSet r,int n)throws SQLException{return new Job(r.getObject("id",UUID.class),r.getObject("requester_id",UUID.class),r.getObject("organization_id",UUID.class),r.getString("country"),r.getString("kind"),r.getObject("from_date",LocalDate.class),r.getObject("to_date",LocalDate.class),r.getTimestamp("created_at").toInstant(),r.getLong("revision"),r.getString("state"),r.getTimestamp("expires_at")==null?null:r.getTimestamp("expires_at").toInstant(),r.getString("failure_code"),r.getString("original"));}
    record Job(UUID id,UUID actor,UUID organization,String country,String kind,LocalDate from,LocalDate to,Instant created,long revision,String state,Instant expires,String failure,String original){@Override public String toString(){return "ExportJob[redacted]";}}
}
