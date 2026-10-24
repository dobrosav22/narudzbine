package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.AuditReads;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY,readOnly=true)
public class JdbcAuditReads implements AuditReads {
    private static final List<String> BUSINESS_RESOURCES=List.of("PRIVACY_CASE","PRIVACY_EXPORT","ORGANIZATION","LOCATION","CONTACT","MEMBER","OWNERSHIP_TRANSFER","RELATIONSHIP","PLAN_REQUEST","VENDOR_PLAN","CATEGORY","TAG","UNIT","MEDIA_ASSET","PRODUCT","AGREED_PRICE","PROMOTION","TRACKING","RECONCILIATION","STOCK","PRODUCT_PRICING","ORDER_STAGE","ORDER","ORDER_MESSAGE","IMPORT","EXPORT");
    private static final List<String> BUSINESS_ACTIONS=List.of(
        "PRIVACY_CASE_REQUESTED","PRIVACY_EXPORT_DOWNLOADED","AGREED_PRICES_REVIEWED","AGREED_PRICE_CONFIRMED","AGREED_PRICE_REMOVED","AGREED_PRICE_SAVED",
        "CANCELLATION_APPROVED","CANCELLATION_REJECTED","CANCELLATION_REQUESTED","CANCELLATION_RESOLVED","CANCELLATION_WITHDRAWN",
        "CONTACT_ARCHIVED","CONTACT_CREATED","CONTACT_RESTORED","CONTACT_UPDATED","IMPORT_CONFIRMED","IMPORT_PREVIEWED",
        "LOCATION_ARCHIVED","LOCATION_CREATED","LOCATION_RESTORED","LOCATION_UPDATED","MEMBER_DEACTIVATED","MEMBER_REACTIVATED","MEMBER_ROLE_CHANGED",
        "MESSAGE_CREATED","ORDER_ACCEPTED","ORDER_CANCELLED","ORDER_DELIVERED","ORDER_DISPATCHED","ORDER_REJECTED","ORDER_STAGE_CHANGED","ORDER_SUBMITTED","ORGANIZATION_UPDATED",
        "PLAN_APPROVED","PLAN_ASSIGNED","PLAN_REJECTED","PLAN_REQUESTED","PLAN_SUPERSEDED","PLAN_WITHDRAWN","PRICING_UPDATED",
        "PRODUCT_ACTIVATED","PRODUCT_ARCHIVED","PRODUCT_CREATED","PRODUCT_DEACTIVATED","PRODUCT_RESTORED","PRODUCT_UPDATED",
        "PROMOTION_ARCHIVED","PROMOTION_CREATED","PROMOTION_STOPPED","PROMOTION_UPDATED",
        "RECONCILIATION_ACKNOWLEDGED","RECONCILIATION_APPLIED","RECONCILIATION_PREPARED","STAGES_REORDERED","STAGE_CREATED","STAGE_RENAMED","STAGE_RETIRED",
        "STOCK_ADJUSTED","STOCK_CONFIRMED","STOCK_INITIALIZED","STOCK_SET","TAXONOMY_CREATED","TAXONOMY_DELETED","TAXONOMY_RENAMED","TRACKING_DISABLED","TRACKING_ENABLED",
        "TRADING_ADMIN_CONNECTED","TRADING_CONNECTED","TRADING_DISCONNECTED","TRADING_RECONNECTED",
        "TRANSFER_ACCEPTED","TRANSFER_EXPIRED","TRANSFER_INVALIDATED","TRANSFER_REQUESTED","TRANSFER_REVOKED","UPLOAD_QUARANTINED","UPLOAD_RESERVED","EXPORT_CREATED","EXPORT_DOWNLOADED");
    private static final Set<String> SHARED_REASONS=Set.of("TRADING_DISCONNECTED","ORDER_REJECTED","ORDER_CANCELLED","CANCELLATION_REQUESTED","CANCELLATION_APPROVED","CANCELLATION_REJECTED","CANCELLATION_WITHDRAWN","CANCELLATION_RESOLVED");
    private static final Pattern FIELD=Pattern.compile("[A-Za-z][A-Za-z0-9_]{0,99}");
    private static final Pattern PRIVATE=Pattern.compile("credential|password|secret|token|proof|evidence|mailbox|session|security_?epoch",Pattern.CASE_INSENSITIVE);
    private final JdbcTemplate jdbc;private final Clock clock;
    public JdbcAuditReads(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
    @Override public Page organization(UUID org,String country,String action,int size,Instant before,UUID afterId){
        Objects.requireNonNull(org);if(!Set.of("RS","BA").contains(country))throw new IllegalArgumentException("Country required");return read(org,country,action,size,before,afterId,false);
    }
    @Override public Page platform(UUID org,String action,int size,Instant before,UUID afterId){return read(org,null,action,size,before,afterId,true);}
    private Page read(UUID org,String country,String action,int size,Instant before,UUID afterId,boolean platform){
        if(size<1||size>100||(before==null)!=(afterId==null))throw new IllegalArgumentException("Invalid audit page");
        String reason=platform?"NULL::text":"reason";
        var sql=new StringBuilder("SELECT id,actor_id,action,resource_id,request_id,"+reason+" AS visible_reason,changed_fields,occurred_at FROM audit_event WHERE occurred_at<=?");
        var args=new ArrayList<Object>();args.add(Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)));
        if(org!=null){sql.append(" AND organization_id=?");args.add(org);}
        if(!platform){sql.append(" AND country=? AND actor_type='BUSINESS'");args.add(country);in(sql,args,"resource_type",BUSINESS_RESOURCES);in(sql,args,"action",BUSINESS_ACTIONS);}
        if(action!=null){sql.append(" AND action=?");args.add(action);}
        if(before!=null){sql.append(" AND (occurred_at<? OR (occurred_at=? AND id>?))");args.add(Timestamp.from(before));args.add(Timestamp.from(before));args.add(afterId);}
        sql.append(" ORDER BY occurred_at DESC,id ASC LIMIT ?");args.add(size+1);
        var rows=jdbc.query(sql.toString(),(r,n)->{
            String code=r.getString("action");var array=r.getArray("changed_fields");List<String> fields;
            try{fields=Arrays.stream((String[])array.getArray()).filter(s->s!=null&&FIELD.matcher(s).matches()&&(platform||!PRIVATE.matcher(s).find())).distinct().limit(100).toList();}finally{array.free();}
            String text=!platform&&SHARED_REASONS.contains(code)?r.getString("visible_reason"):null;
            return new Event(r.getObject("id",UUID.class),r.getObject("actor_id",UUID.class),code,r.getObject("resource_id",UUID.class),r.getObject("request_id",UUID.class),text,fields,r.getTimestamp("occurred_at").toInstant());
        },args.toArray());
        return new Page(List.copyOf(rows.subList(0,Math.min(size,rows.size()))),rows.size()>size);
    }
    private static void in(StringBuilder sql,List<Object> args,String column,List<String> values){sql.append(" AND ").append(column).append(" IN(").append(String.join(",",Collections.nCopies(values.size(),"?"))).append(")");args.addAll(values);}
}
