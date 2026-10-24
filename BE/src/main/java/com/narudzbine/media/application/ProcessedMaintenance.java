package com.narudzbine.media.application;

import com.narudzbine.media.api.PrivateQuarantine;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public final class ProcessedMaintenance {
    private final JdbcTemplate jdbc;private final PrivateQuarantine storage;private final Clock clock;
    private final UuidGenerator ids;private final MediaDisposal disposal;private final TransactionTemplate tx;
    public ProcessedMaintenance(JdbcTemplate jdbc,PrivateQuarantine storage,Clock clock,UuidGenerator ids,PlatformTransactionManager manager){
        this.jdbc=jdbc;this.storage=storage;this.clock=clock;this.ids=ids;this.disposal=new MediaDisposal(jdbc,clock);tx=new TransactionTemplate(manager);tx.setTimeout(10);
    }
    public int sweep(){
        var candidates=tx.execute(s->jdbc.query("SELECT id FROM media_asset WHERE state='READY' AND unreferenced_at<=? ORDER BY unreferenced_at,id LIMIT 25",(r,n)->r.getObject(1,UUID.class),time(now().minusSeconds(86400))));
        int count=0;for(var id:candidates){if(clean(id)){count++;}}return count;
    }
    /** Internal maintenance entry point; claim excludes attachment before any provider I/O. */
    public boolean clean(UUID id){
        var claim=tx.execute(s->claim(id));if(claim==null){return false;}
        storage.fenceProcessed(claim.processed());if(claim.raw()!=null){storage.delete(claim.raw());}
        tx.executeWithoutResult(s->{
            guard(claim.vendor());var row=jdbc.queryForMap("SELECT state,processed_deleted_at FROM media_asset WHERE id=? FOR UPDATE",id);
            if(row.get("processed_deleted_at")!=null){return;}
            if(!row.get("state").equals("READY")){throw new IllegalStateException("Processed cleanup state differs");}
            Instant at=now();
            jdbc.update("UPDATE media_asset SET state='DELETED',processed_deleted_at=?,revision=revision+1 WHERE id=?",time(at),id);
            if(claim.raw()!=null&&jdbc.update("UPDATE media_upload SET raw_deleted_at=? WHERE asset_id=? AND raw_deleted_at IS NULL",time(at),id)==1){
                if(jdbc.update("INSERT INTO media_upload_event(id,asset_id,kind,occurred_at) VALUES (?,?,'RAW_DELETED',?)",ids.next(),id,time(at))!=1){throw new IllegalStateException("Raw deletion event missing");}
            }
            event(id,"DELETED",at);disposal.completed(id,"PROCESSED");
        });return true;
    }
    private Claim claim(UUID id){
        var vendors=jdbc.query("SELECT vendor_id FROM media_asset WHERE id=?",(r,n)->r.getObject(1,UUID.class),id);
        if(vendors.isEmpty()){return null;}UUID vendor=vendors.getFirst();guard(vendor);
        var a=jdbc.queryForMap("SELECT * FROM media_asset WHERE id=? FOR UPDATE",id);Instant at=now();
        if(!a.get("state").equals("READY")||a.get("unreferenced_at")==null
                ||((Timestamp)a.get("unreferenced_at")).toInstant().isAfter(at.minusSeconds(86400))
                ||Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM catalogue_product_gallery WHERE asset_id=?)",Boolean.class,id))){return null;}
        var raw=jdbc.query("SELECT raw_key FROM media_upload WHERE asset_id=? FOR UPDATE",(r,n)->r.getString(1),id);
        if(!disposal.claim(id,"PROCESSED")){return null;}
        if(a.get("cleanup_claimed_at")==null){
            jdbc.update("UPDATE media_asset SET cleanup_claimed_at=?,revision=revision+1 WHERE id=?",time(at),id);event(id,"CLAIMED",at);
        }
        return new Claim(vendor,a.get("processed_key").toString(),raw.isEmpty()?null:raw.getFirst());
    }
    private void guard(UUID vendor){jdbc.queryForObject("SELECT id FROM organization WHERE id=? FOR UPDATE",UUID.class,vendor);}
    private void event(UUID id,String kind,Instant at){if(jdbc.update("INSERT INTO media_cleanup_event(id,asset_id,kind,occurred_at) VALUES (?,?,?,?)",ids.next(),id,kind,time(at))!=1){throw new IllegalStateException("Cleanup event missing");}}
    private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
    private static Timestamp time(Instant at){return Timestamp.from(at);}
    private record Claim(UUID vendor,String processed,String raw){}
}
