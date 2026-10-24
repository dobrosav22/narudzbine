package com.narudzbine.trading.application;
import com.narudzbine.trading.api.*;
import com.narudzbine.audit.api.TradingAudit;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.*;
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcTradingConnections implements TradingConnections {
    private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;private final TradingAudit audit;
    public JdbcTradingConnections(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,TradingAudit audit){this.jdbc=jdbc;this.clock=clock;this.ids=ids;this.audit=audit;}
    public List<View> activeConnections(UUID organization){return jdbc.queryForList("SELECT * FROM trading_relationship WHERE state='ACTIVE' AND(vendor_id=? OR buyer_id=?) ORDER BY id",organization,organization).stream().map(JdbcTradingConnections::map).toList();}
    public View updatePriceConfirmation(UUID vendor,UUID relationship,boolean required){var r=get(vendor,relationship);if(!r.vendorId().equals(vendor)||!r.state().equals("ACTIVE")){throw failure(TradingFailure.Reason.INVALID_STATE);}if(r.confirmationRequired()!=required){jdbc.update("UPDATE trading_relationship SET agreed_price_confirmation_required=?,revision=revision+1,updated_at=? WHERE id=?",required,Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)),relationship);}return get(vendor,relationship);}
    public void requireCapacity(UUID vendor){
        var plans=jdbc.queryForList("SELECT p.active_buyer_limit FROM organization_plan a JOIN plan_revision p ON p.id=a.plan_revision_id WHERE a.organization_id=? FOR SHARE OF a",vendor);
        if(plans.isEmpty()){throw failure(TradingFailure.Reason.PLAN_REQUIRED);}int cap=((Number)plans.getFirst().get("active_buyer_limit")).intValue();
        if(jdbc.queryForObject("SELECT count(*) FROM trading_relationship WHERE vendor_id=? AND state='ACTIVE'",Integer.class,vendor)>=cap){throw failure(TradingFailure.Reason.PLAN_LIMIT_EXCEEDED);}
    }
    public View connect(UUID vendor,UUID buyer,UUID actor){
        var existing=jdbc.queryForList("SELECT * FROM trading_relationship WHERE vendor_id=? AND buyer_id=? FOR UPDATE",vendor,buyer);
        if(!existing.isEmpty()&&existing.getFirst().get("state").equals("ACTIVE")){return map(existing.getFirst());}
        requireCapacity(vendor);UUID id;var now=Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));boolean reconnect=!existing.isEmpty();
        if(reconnect){id=(UUID)existing.getFirst().get("id");jdbc.update("UPDATE trading_relationship SET state='ACTIVE',disconnected_reason=NULL,revision=revision+1,connection_generation=connection_generation+1,agreed_price_confirmation_required=true,updated_at=? WHERE id=?",now,id);}
        else{id=ids.next();jdbc.update("INSERT INTO trading_relationship(id,vendor_id,buyer_id,country,state,created_at,updated_at) SELECT ?,v.id,b.id,v.country,'ACTIVE',?,? FROM organization v JOIN organization b ON b.id=? WHERE v.id=? AND v.type='VENDOR' AND b.type='BUYER' AND v.country=b.country AND v.state='ACTIVE' AND b.state='ACTIVE'",id,now,now,buyer,vendor);}
        View result=get(vendor,id);audit.connected(actor,id,reconnect);return result;
    }
    public View disconnect(UUID organization,UUID relationship,String reason,UUID actor){
        var current=get(organization,relationship);
        if(current.state().equals("DISCONNECTED")){return current;}
        jdbc.update("UPDATE trading_relationship SET state='DISCONNECTED',disconnected_reason=?,revision=revision+1,updated_at=? WHERE id=?",reason,Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)),relationship);
        audit.disconnected(actor,relationship,reason);
        return get(organization,relationship);
    }
    public Optional<View> find(UUID vendor,UUID buyer){return jdbc.queryForList("SELECT * FROM trading_relationship WHERE vendor_id=? AND buyer_id=?",vendor,buyer).stream().map(JdbcTradingConnections::map).findFirst();}
    public View get(UUID organization,UUID id){var rows=jdbc.queryForList("SELECT * FROM trading_relationship WHERE id=? AND (vendor_id=? OR buyer_id=?)",id,organization,organization);if(rows.isEmpty()){throw failure(TradingFailure.Reason.NOT_FOUND);}return map(rows.getFirst());}
    public Partner partner(UUID organization,UUID partner){return findPartner(organization,partner).orElseThrow(()->failure(TradingFailure.Reason.NOT_FOUND));}
    public java.util.Optional<Partner> findPartner(UUID organization,UUID partner){
        var rows=jdbc.queryForList("""
            WITH relationship AS MATERIALIZED (
             SELECT * FROM trading_relationship WHERE (vendor_id=? AND buyer_id=?) OR (buyer_id=? AND vendor_id=?)
            ), projection AS (
             SELECT o.id,o.display_name,o.legal_name,o.country,o.currency,o.registration_identifier,o.tax_identifier,
              c.contact_name,c.contact_phone,c.contact_email,r.id AS relationship_id,r.state AS relationship_state
             FROM relationship r JOIN organization o ON o.id=? AND o.state='ACTIVE'
             LEFT JOIN business_contact c ON c.organization_id=o.id AND c.id=o.partner_contact_id AND c.state='ACTIVE'
             WHERE r.state='ACTIVE'
             UNION ALL
             SELECT s.organization_id,s.display_name,s.legal_name,s.country,s.currency,s.registration_identifier,s.tax_identifier,
              s.contact_name,s.contact_phone,s.contact_email,r.id,r.state
             FROM relationship r JOIN partner_snapshot s ON s.relationship_id=r.id AND s.relationship_revision=r.revision AND s.organization_id=?
             WHERE r.state='DISCONNECTED'
            ) SELECT * FROM projection
            """,organization,partner,organization,partner,partner,partner);
        if(rows.isEmpty()){return java.util.Optional.empty();}
        var r=rows.getFirst();Contact contact=r.get("contact_name")==null?null:new Contact((String)r.get("contact_name"),(String)r.get("contact_phone"),(String)r.get("contact_email"));
        return java.util.Optional.of(new Partner((UUID)r.get("id"),(String)r.get("display_name"),(String)r.get("legal_name"),(String)r.get("country"),(String)r.get("currency"),(String)r.get("registration_identifier"),(String)r.get("tax_identifier"),contact,(UUID)r.get("relationship_id"),(String)r.get("relationship_state")));
    }
    public Page list(UUID organization,int page,int size,String state,boolean total){var rows=jdbc.queryForList("""
            WITH filtered AS MATERIALIZED (SELECT * FROM trading_relationship WHERE (vendor_id=? OR buyer_id=?) AND (?::text IS NULL OR state=?)),
            page AS (SELECT * FROM filtered ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?)
            SELECT p.*,t.total FROM (SELECT CASE WHEN ? THEN count(*) ELSE NULL END AS total FROM filtered)t
            LEFT JOIN page p ON true ORDER BY p.created_at DESC,p.id ASC
            """,organization,organization,state,state,size,Math.multiplyExact(page,size),total);
        return new Page(rows.stream().filter(r->r.get("id")!=null).map(JdbcTradingConnections::map).toList(),(Long)rows.getFirst().get("total"));
    }
    private static View map(Map<String,Object> r){return new View((UUID)r.get("id"),((Number)r.get("revision")).longValue(),(UUID)r.get("vendor_id"),(UUID)r.get("buyer_id"),(String)r.get("country"),(String)r.get("state"),(String)r.get("disconnected_reason"),((Number)r.get("connection_generation")).longValue(),(Boolean)r.get("agreed_price_confirmation_required"),((Timestamp)r.get("created_at")).toInstant(),((Timestamp)r.get("updated_at")).toInstant());}
    private static TradingFailure failure(TradingFailure.Reason reason){return new TradingFailure(reason);}
}
