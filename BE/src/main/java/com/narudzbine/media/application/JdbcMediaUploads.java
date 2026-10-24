package com.narudzbine.media.application;
import com.narudzbine.media.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcMediaUploads implements MediaUploads {
    private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;private final MediaDisposal disposal;
    public JdbcMediaUploads(JdbcTemplate jdbc,Clock clock,UuidGenerator ids){this.jdbc=jdbc;this.clock=clock;this.ids=ids;this.disposal=new MediaDisposal(jdbc,clock);}
    @Override public Asset read(UUID vendor,UUID id){return jdbc.query("SELECT * FROM media_asset WHERE vendor_id=? AND id=?",JdbcMediaUploads::map,vendor,id).stream().findFirst().orElseThrow(()->failure("NOT_FOUND"));}
    @Override public Claim reserve(UUID vendor,UUID id,Source source){
        guard(vendor);var rows=jdbc.queryForList("SELECT u.*,a.cleanup_claimed_at,a.state FROM media_upload u JOIN media_asset a ON a.id=u.asset_id WHERE u.asset_id=? AND a.vendor_id=? FOR UPDATE OF a,u",id,vendor);
        if(!rows.isEmpty()){
            var row=rows.getFirst();if(!row.get("sha256").equals(source.sha256())||((Number)row.get("bytes")).longValue()!=source.bytes()||!row.get("media_type").equals(source.mediaType())){throw failure("IDEMPOTENCY_MISMATCH");}
            var asset=read(vendor,id);if(row.get("raw_confirmed_at")!=null){return new Claim(asset,null,null,false,true);}
            if(row.get("cleanup_claimed_at")!=null||!row.get("state").equals("QUEUED")){throw failure("INVALID_STATE");}
            if(((Timestamp)row.get("lease_until")).toInstant().isAfter(now())){throw failure("UPLOAD_IN_PROGRESS");}
            UUID fence=ids.next();jdbc.update("UPDATE media_upload SET fence=?,lease_until=?,progress_at=? WHERE asset_id=?",fence,time(now().plusSeconds(120)),time(now()),id);
            return new Claim(asset,row.get("raw_key").toString(),fence,false,false);
        }
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM media_asset WHERE id=?)",Boolean.class,id))){throw failure("NOT_FOUND");}
        UUID fence=ids.next();String key="quarantine/"+vendor+"/"+id;
        // A competing vendor cannot adopt the same global asset identity.
        if(jdbc.update("INSERT INTO media_asset(id,vendor_id,media_type,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING",id,vendor,source.mediaType(),time(now()))!=1){throw failure("NOT_FOUND");}
        jdbc.update("INSERT INTO media_upload(asset_id,vendor_id,sha256,bytes,media_type,raw_key,fence,lease_until,progress_at) VALUES (?,?,?,?,?,?,?,?,?)",id,vendor,source.sha256(),source.bytes(),source.mediaType(),key,fence,time(now().plusSeconds(120)),time(now()));
        event(id,"RESERVED");return new Claim(read(vendor,id),key,fence,true,false);
    }
    @Override public Completion complete(UUID vendor,UUID id,UUID fence){
        guard(vendor);var rows=jdbc.queryForList("SELECT u.*,a.cleanup_claimed_at,a.state FROM media_upload u JOIN media_asset a ON a.id=u.asset_id WHERE u.asset_id=? AND a.vendor_id=? FOR UPDATE OF a,u",id,vendor);
        if(rows.isEmpty()){throw failure("NOT_FOUND");}var row=rows.getFirst();
        if(row.get("raw_confirmed_at")!=null){return new Completion(read(vendor,id),false);}
        if(!row.get("fence").equals(fence)||!((Timestamp)row.get("lease_until")).toInstant().isAfter(now())||row.get("cleanup_claimed_at")!=null||!row.get("state").equals("QUEUED")){throw failure("UPLOAD_IN_PROGRESS");}
        jdbc.update("UPDATE media_upload SET raw_confirmed_at=?,progress_at=? WHERE asset_id=?",time(now()),time(now()),id);
        jdbc.update("INSERT INTO media_processing_job(asset_id,state,created_at) VALUES (?,'PENDING',?)",id,time(now()));
        jdbc.update("UPDATE media_asset SET revision=revision+1 WHERE id=?",id);event(id,"QUARANTINED");return new Completion(read(vendor,id),true);
    }
    @Override public List<UUID> expiredCandidates(int limit){return jdbc.query("SELECT u.asset_id FROM media_upload u JOIN media_asset a ON a.id=u.asset_id WHERE u.raw_deleted_at IS NULL AND a.state IN ('QUEUED','PROCESSING','FAILED') AND NOT EXISTS(SELECT 1 FROM media_processing_job j WHERE j.asset_id=a.id AND j.state='PROCESSING' AND j.lease_until>?) AND (a.cleanup_claimed_at IS NOT NULL OR (u.progress_at<=? AND u.lease_until<=?)) ORDER BY u.progress_at,u.asset_id LIMIT ?",(r,n)->r.getObject(1,UUID.class),time(now()),time(now().minusSeconds(3600)),time(now()),Math.min(100,Math.max(1,limit)));}
    @Override public Optional<Cleanup> claimCleanup(UUID id){
        var vendors=jdbc.query("SELECT vendor_id FROM media_upload WHERE asset_id=?",(r,n)->r.getObject(1,UUID.class),id);if(vendors.isEmpty()){return Optional.empty();}UUID vendor=vendors.getFirst();guard(vendor);
        var rows=jdbc.queryForList("SELECT u.*,a.state,a.cleanup_claimed_at FROM media_upload u JOIN media_asset a ON a.id=u.asset_id WHERE u.asset_id=? FOR UPDATE OF a,u",id);if(rows.isEmpty()){return Optional.empty();}var r=rows.getFirst();
        if(r.get("raw_deleted_at")!=null||!Set.of("QUEUED","PROCESSING","FAILED").contains(r.get("state"))){return Optional.empty();}
        var jobs=jdbc.queryForList("SELECT state,lease_until FROM media_processing_job WHERE asset_id=? FOR UPDATE",id);if(!jobs.isEmpty()&&"PROCESSING".equals(jobs.getFirst().get("state"))&&((Timestamp)jobs.getFirst().get("lease_until")).toInstant().isAfter(now())){return Optional.empty();}
        if(r.get("cleanup_claimed_at")==null&&(((Timestamp)r.get("progress_at")).toInstant().isAfter(now().minusSeconds(3600))||((Timestamp)r.get("lease_until")).toInstant().isAfter(now()))){return Optional.empty();}
        if(!disposal.claim(id,"QUARANTINE")){return Optional.empty();}
        if(r.get("cleanup_claimed_at")==null){
            if(((Timestamp)r.get("progress_at")).toInstant().isAfter(now().minusSeconds(3600))||((Timestamp)r.get("lease_until")).toInstant().isAfter(now())){return Optional.empty();}
            jdbc.update("UPDATE media_asset SET cleanup_claimed_at=?,state='FAILED',failure_code=COALESCE(failure_code,'UPLOAD_EXPIRED'),revision=revision+1 WHERE id=?",time(now()),id);
            jdbc.update("UPDATE media_processing_job SET state='CANCELLED' WHERE asset_id=? AND state IN('PENDING','PROCESSING','FAILED')",id);event(id,"CLEANUP_CLAIMED");
        }
        return Optional.of(new Cleanup(id,vendor,r.get("raw_key").toString()));
    }
    @Override public void deleted(Cleanup claim){guard(claim.vendor());var r=jdbc.queryForMap("SELECT u.raw_deleted_at,a.cleanup_claimed_at FROM media_upload u JOIN media_asset a ON a.id=u.asset_id WHERE u.asset_id=? AND a.vendor_id=? FOR UPDATE OF a,u",claim.id(),claim.vendor());if(r.get("raw_deleted_at")!=null){return;}
        if(r.get("cleanup_claimed_at")==null){throw failure("INVALID_STATE");}jdbc.update("UPDATE media_upload SET raw_deleted_at=? WHERE asset_id=?",time(now()),claim.id());jdbc.update("UPDATE media_asset SET state='DELETED',revision=revision+1 WHERE id=?",claim.id());event(claim.id(),"RAW_DELETED");disposal.completed(claim.id(),"QUARANTINE");}
    private void event(UUID id,String kind){if(jdbc.update("INSERT INTO media_upload_event(id,asset_id,kind,occurred_at) VALUES (?,?,?,?)",ids.next(),id,kind,time(now()))!=1){throw new IllegalStateException("Upload event missing");}}
    private void guard(UUID vendor){if(jdbc.query("SELECT id FROM organization WHERE id=? AND type='VENDOR' FOR UPDATE",(r,n)->r.getObject(1,UUID.class),vendor).isEmpty()){throw failure("NOT_FOUND");}}
    private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}private static Timestamp time(Instant at){return Timestamp.from(at);}
    private static MediaFailure failure(String code){return new MediaFailure(code);}
    private static Asset map(ResultSet r,int n)throws SQLException{return new Asset(r.getObject("id",UUID.class),r.getLong("revision"),r.getString("state"),r.getString("media_type"),(Integer)r.getObject("width"),(Integer)r.getObject("height"),r.getString("failure_code"),r.getTimestamp("created_at").toInstant());}
}
