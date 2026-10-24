package com.narudzbine.media.application;

import com.narudzbine.media.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Internal worker; constructed with a separate processing database credential. */
public final class MediaProcessing {
    public record Claim(UUID id,UUID vendor,UUID fence,String key,long bytes,String sha,String type) {}
    private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;
    private final ProcessingStorage storage;private final PrivateQuarantine quarantine;private final ImageProcessor processor;
    private final TransactionTemplate tx;private final MediaDisposal disposal;private final AtomicBoolean running=new AtomicBoolean();
    public MediaProcessing(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,ProcessingStorage storage,PrivateQuarantine quarantine,ImageProcessor processor,PlatformTransactionManager manager) {
        this.jdbc=jdbc;this.clock=clock;this.ids=ids;this.storage=storage;this.quarantine=quarantine;this.processor=processor;
        disposal=new MediaDisposal(jdbc,clock);tx=new TransactionTemplate(manager);tx.setTimeout(10);
    }
    public int tick() {
        if(!running.compareAndSet(false,true)) return 0;
        try {
            var candidates=jdbc.query("SELECT asset_id FROM media_processing_job WHERE state='PENDING' OR (state='PROCESSING' AND lease_until<=?) ORDER BY created_at,asset_id LIMIT 25",(r,n)->r.getObject(1,UUID.class),time(now()));
            for(UUID id:candidates) {
                Claim claim=tx.execute(s->claim(id));if(claim==null) continue;
                try {
                    byte[] source=storage.raw(claim.key(),claim.bytes(),claim.sha());
                    var image=processor.process(source,claim.type());String hash=sha(image.bytes());
                    String key="processed/"+claim.vendor()+"/"+claim.id();
                    storage.processed(key,image.bytes(),hash,image.mediaType());
                    tx.executeWithoutResult(s->publish(claim,key,hash,image));
                    clearReadyRaw();return 1;
                } catch(MediaFailure failure) {
                    if(!failure.code().equals("SERVICE_UNAVAILABLE")) tx.executeWithoutResult(s->fail(claim,failure.code()));
                    // Conditional provider operations are recoverable; retain the fence until expiry.
                    return 0;
                }
            }
            clearReadyRaw();return 0;
        } finally {running.set(false);}
    }
    public Claim claim(UUID id) {
        requireTransaction();
        UUID vendor=vendor(id);if(vendor==null) return null;guard(vendor);
        var rows=jdbc.queryForList("SELECT u.*,a.state,a.cleanup_claimed_at,j.state AS job_state,j.lease_until AS processing_lease,j.attempts FROM media_asset a JOIN media_upload u ON u.asset_id=a.id JOIN media_processing_job j ON j.asset_id=a.id WHERE a.id=? FOR UPDATE OF a,u,j",id);
        if(rows.isEmpty()) return null;var row=rows.getFirst();
        if(row.get("cleanup_claimed_at")!=null||(!row.get("job_state").equals("PENDING")&&!row.get("job_state").equals("PROCESSING"))||(row.get("processing_lease")!=null&&((Timestamp)row.get("processing_lease")).toInstant().isAfter(now()))) return null;
        if(((Number)row.get("attempts")).intValue()>=3) {terminal(id,"SERVICE_UNAVAILABLE");return null;}
        UUID fence=ids.next();
        jdbc.update("UPDATE media_processing_job SET state='PROCESSING',fence=?,lease_until=?,attempts=attempts+1 WHERE asset_id=?",fence,time(now().plusSeconds(120)),id);
        jdbc.update("UPDATE media_asset SET state='PROCESSING',revision=revision+1 WHERE id=?",id);
        jdbc.update("UPDATE media_upload SET progress_at=? WHERE asset_id=?",time(now()),id);
        return new Claim(id,vendor,fence,row.get("raw_key").toString(),((Number)row.get("bytes")).longValue(),row.get("sha256").toString(),row.get("media_type").toString());
    }
    public boolean publish(Claim claim,String key,String hash,ImageProcessor.Image image) {
        if(!current(claim)) return false;
        if(!claim.type().equals(image.mediaType())||!key.equals("processed/"+claim.vendor()+"/"+claim.id())||!hash.equals(sha(image.bytes()))||image.bytes().length<1||image.bytes().length>5242880||image.width()<1||image.width()>2048||image.height()<1||image.height()>2048) throw new IllegalArgumentException("Invalid processed proof");
        jdbc.update("UPDATE media_asset SET state='READY',processed_key=?,processed_sha256=?,processed_bytes=?,width=?,height=?,ready_at=?,unreferenced_at=?,failure_code=NULL,revision=revision+1 WHERE id=?",key,HexFormat.of().parseHex(hash),image.bytes().length,image.width(),image.height(),time(now()),time(now()),claim.id());
        jdbc.update("UPDATE media_processing_job SET state='READY' WHERE asset_id=?",claim.id());
        jdbc.update("UPDATE media_upload SET progress_at=? WHERE asset_id=?",time(now()),claim.id());event(claim.id(),"PROCESSING_READY");return true;
    }
    public void fail(Claim claim,String code) {if(current(claim)) terminal(claim.id(),code);}
    private void terminal(UUID id,String code) {
        jdbc.update("UPDATE media_asset SET state='FAILED',failure_code=?,revision=revision+1 WHERE id=?",code,id);
        jdbc.update("UPDATE media_processing_job SET state='FAILED' WHERE asset_id=?",id);
        jdbc.update("UPDATE media_upload SET progress_at=? WHERE asset_id=?",time(now()),id);event(id,"PROCESSING_FAILED");
    }
    private boolean current(Claim claim) {
        requireTransaction();
        guard(claim.vendor());var rows=jdbc.queryForList("SELECT j.fence,j.lease_until,j.state,a.cleanup_claimed_at FROM media_asset a JOIN media_upload u ON u.asset_id=a.id JOIN media_processing_job j ON j.asset_id=a.id WHERE a.id=? AND a.vendor_id=? FOR UPDATE OF a,u,j",claim.id(),claim.vendor());
        if(rows.isEmpty()) return false;var row=rows.getFirst();return "PROCESSING".equals(row.get("state"))&&row.get("cleanup_claimed_at")==null&&claim.fence().equals(row.get("fence"))&&((Timestamp)row.get("lease_until")).toInstant().isAfter(now());
    }
    public int clearReadyRaw() {
        var rows=jdbc.queryForList("SELECT u.asset_id,u.vendor_id,u.raw_key FROM media_upload u JOIN media_asset a ON a.id=u.asset_id WHERE a.state='READY' AND u.raw_deleted_at IS NULL ORDER BY a.ready_at,a.id LIMIT 25");
        int count=0;
        for(var row:rows) {
            UUID id=(UUID)row.get("asset_id"),vendor=(UUID)row.get("vendor_id");
            boolean claimed=Boolean.TRUE.equals(tx.execute(s->{guard(vendor);var current=jdbc.queryForMap("SELECT a.state,u.raw_deleted_at FROM media_asset a JOIN media_upload u ON u.asset_id=a.id WHERE a.id=? FOR UPDATE OF a,u",id);return current.get("state").equals("READY")&&current.get("raw_deleted_at")==null&&disposal.claim(id,"READY_RAW");}));
            if(!claimed)continue;
            quarantine.delete(row.get("raw_key").toString());
            tx.executeWithoutResult(s->{guard(vendor);var state=jdbc.queryForMap("SELECT a.state,u.raw_deleted_at FROM media_asset a JOIN media_upload u ON u.asset_id=a.id WHERE a.id=? FOR UPDATE OF a,u",id);if(state.get("raw_deleted_at")==null&&state.get("state").equals("READY")) {jdbc.update("UPDATE media_upload SET raw_deleted_at=? WHERE asset_id=?",time(now()),id);event(id,"RAW_DELETED");disposal.completed(id,"READY_RAW");}});count++;
        }
        return count;
    }
    private UUID vendor(UUID id) {return jdbc.query("SELECT vendor_id FROM media_upload WHERE asset_id=?",(r,n)->r.getObject(1,UUID.class),id).stream().findFirst().orElse(null);}
    private void guard(UUID vendor) {jdbc.queryForObject("SELECT id FROM organization WHERE id=? FOR UPDATE",UUID.class,vendor);}
    private void event(UUID id,String kind) {jdbc.update("INSERT INTO media_upload_event(id,asset_id,kind,occurred_at) VALUES (?,?,?,?)",ids.next(),id,kind,time(now()));}
    private static void requireTransaction() {if(!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Processing action requires transaction");}
    private Instant now() {return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
    private static Timestamp time(Instant value) {return Timestamp.from(value);}
    public static String sha(byte[] bytes) {try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(java.security.NoSuchAlgorithmException failure) {throw new IllegalStateException(failure);}}
}
