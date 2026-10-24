package com.narudzbine.media.application;

import com.narudzbine.catalogue.api.GalleryAssets;
import com.narudzbine.catalogue.api.ProductFailure;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcGalleryAssets implements GalleryAssets {
    private final JdbcTemplate jdbc;
    public JdbcGalleryAssets(JdbcTemplate jdbc){this.jdbc=jdbc;}
    @Override public void lockAndValidate(UUID vendor,UUID product,List<UUID> previous,List<UUID> requested){
        var ids=new TreeSet<UUID>(Comparator.comparing(UUID::toString));ids.addAll(previous);ids.addAll(requested);
        for(UUID id:ids){
            var rows=jdbc.queryForList("SELECT state,cleanup_claimed_at FROM media_asset WHERE id=? AND vendor_id=? FOR UPDATE",id,vendor);
            if(rows.isEmpty()){throw invalid();}var row=rows.getFirst();
            if(requested.contains(id)){
                if(!row.get("state").equals("READY")||row.get("cleanup_claimed_at")!=null){throw invalid();}
                var attached=jdbc.query("SELECT product_id FROM catalogue_product_gallery WHERE asset_id=?",(r,n)->r.getObject(1,UUID.class),id);
                if(!attached.isEmpty()&&!attached.getFirst().equals(product)){throw invalid();}
            }
        }
    }
    @Override public void referencesChanged(List<UUID> previous,List<UUID> requested,Instant at){
        for(UUID id:previous){if(!requested.contains(id)){jdbc.update("UPDATE media_asset SET unreferenced_at=? WHERE id=?",Timestamp.from(at),id);}}
        for(UUID id:requested){if(!previous.contains(id)){jdbc.update("UPDATE media_asset SET unreferenced_at=NULL WHERE id=?",id);}}
    }
    private static ProductFailure invalid(){return new ProductFailure(ProductFailure.Reason.INVALID_REFERENCE,"/assetIds",null);}
}
