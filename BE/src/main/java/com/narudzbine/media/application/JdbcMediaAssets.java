package com.narudzbine.media.application;

import com.narudzbine.media.api.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service @Transactional(propagation=Propagation.MANDATORY)
public class JdbcMediaAssets implements MediaAssets {
    private final JdbcTemplate jdbc;
    public JdbcMediaAssets(JdbcTemplate jdbc){this.jdbc=jdbc;}
    @Override public Route route(UUID id){return jdbc.query("SELECT a.vendor_id,g.product_id FROM media_asset a LEFT JOIN catalogue_product_gallery g ON g.asset_id=a.id WHERE a.id=?",(r,n)->new Route(r.getObject(1,UUID.class),r.getObject(2,UUID.class)),id).stream().findFirst().orElseThrow(JdbcMediaAssets::missing);}
    @Override public Proof proof(UUID id){
        var rows=jdbc.queryForList("SELECT * FROM media_asset WHERE id=? FOR UPDATE",id);if(rows.isEmpty())throw missing();var row=rows.getFirst();
        if(!"READY".equals(row.get("state"))||row.get("cleanup_claimed_at")!=null)throw missing();
        return new Proof(id,(UUID)row.get("vendor_id"),(String)row.get("processed_key"),HexFormat.of().formatHex((byte[])row.get("processed_sha256")),((Number)row.get("processed_bytes")).intValue(),(String)row.get("media_type"));
    }
    private static MediaFailure missing(){return new MediaFailure("NOT_FOUND");}
}
