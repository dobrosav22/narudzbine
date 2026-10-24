package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import com.narudzbine.shared.api.UuidGenerator;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.slf4j.MDC;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcPrivacyCases implements PrivacyCases {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final JdbcTemplate jdbc;private final ObjectProvider<ResourceRevisions> revisions;private final Clock clock;private final UuidGenerator ids;private final ObjectProvider<PrivacyFulfillment> fulfillment;
    public JdbcPrivacyCases(JdbcTemplate jdbc,ObjectProvider<ResourceRevisions> revisions,Clock clock,UuidGenerator ids){this(jdbc,revisions,clock,ids,null);}
    @org.springframework.beans.factory.annotation.Autowired
    public JdbcPrivacyCases(JdbcTemplate jdbc,ObjectProvider<ResourceRevisions> revisions,Clock clock,UuidGenerator ids,ObjectProvider<PrivacyFulfillment> fulfillment){this.jdbc=jdbc;this.revisions=revisions;this.clock=clock;this.ids=ids;this.fulfillment=fulfillment;}
    @Override public View create(Scope scope,Command command){
        var old=receipt(command.id());if(old.isPresent())return replay(scope,command,old.get());
        Instant at=now();var original=new View(command.id(),revisions.getObject().encode("privacy/v1",command.id(),1),command.kind(),scope.organization(),"REQUESTED",time(at));
        int inserted=jdbc.update("INSERT INTO privacy_case(id,requester_id,organization_id,country,kind,private_reason,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",command.id(),scope.actor(),scope.organization(),scope.country(),command.kind(),command.reason(),Timestamp.from(at));
        if(inserted==0)return replay(scope,command,receipt(command.id()).orElseThrow(()->new PrivacyFailure("NOT_FOUND")));
        jdbc.update("INSERT INTO privacy_case_creation(id,requester_id,organization_id,country,payload_digest,created_at,original_response) VALUES(?,?,?,?,?,?,?::jsonb)",command.id(),scope.actor(),scope.organization(),scope.country(),digest(command),Timestamp.from(at),JSON.writeValueAsString(original));
        append(scope.actor(),scope.organization(),scope.country(),command.id(),false);
        return original;
    }
    private View replay(Scope scope,Command command,Receipt row){
        if(!row.actor().equals(scope.actor())||!row.organization().equals(scope.organization())||!row.country().equals(scope.country()))throw new PrivacyFailure("NOT_FOUND");
        if(!MessageDigest.isEqual(row.digest(),digest(command)))throw new PrivacyFailure("IDEMPOTENCY_MISMATCH");
        if(!now().isBefore(row.created().plus(Duration.ofDays(7))))throw new PrivacyFailure("REPLAY_EXPIRED",command.id());
        if(row.original()==null)throw new PrivacyFailure("SERVICE_UNAVAILABLE");
        return JSON.readValue(row.original(),View.class);
    }
    @Override public View read(Scope scope,UUID id){
        return jdbc.query("SELECT * FROM privacy_case_metadata WHERE id=? AND organization_id=? AND country=?",this::view,id,scope.organization(),scope.country()).stream().findFirst().orElseThrow(()->new PrivacyFailure("NOT_FOUND"));
    }
    @Override public View administrative(UUID actor,UUID id){
        var rows=jdbc.queryForList("SELECT * FROM privacy_case_metadata WHERE id=?",id);if(rows.isEmpty())throw new PrivacyFailure("NOT_FOUND");
        var row=rows.getFirst();append(actor,(UUID)row.get("organization_id"),(String)row.get("country"),id,true);
        var current=current(id);return new View(id,revisions.getObject().encode("privacy/v1",id,current.revision()),(String)row.get("kind"),(UUID)row.get("organization_id"),current.state(),time(((Timestamp)row.get("created_at")).toInstant()));
    }
    private View view(ResultSet r,int n)throws SQLException {var id=r.getObject("id",UUID.class);var current=current(id);return new View(id,revisions.getObject().encode("privacy/v1",id,current.revision()),r.getString("kind"),r.getObject("organization_id",UUID.class),current.state(),time(r.getTimestamp("created_at").toInstant()));}
    private PrivacyFulfillment.State current(UUID id){var projection=fulfillment==null?null:fulfillment.getIfAvailable();return projection==null?new PrivacyFulfillment.State(1,"REQUESTED"):projection.current(id).orElseGet(()->new PrivacyFulfillment.State(1,"REQUESTED"));}
    private Optional<Receipt> receipt(UUID id){return jdbc.query("SELECT requester_id,organization_id,country,payload_digest,created_at,original_response::text AS original FROM privacy_case_creation WHERE id=?",(r,n)->new Receipt(r.getObject("requester_id",UUID.class),r.getObject("organization_id",UUID.class),r.getString("country"),r.getBytes("payload_digest"),r.getTimestamp("created_at").toInstant(),r.getString("original")),id).stream().findFirst();}
    private void append(UUID actor,UUID org,String country,UUID resource,boolean admin){
        String sql=admin?"INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,target_organization_id,target_country) SELECT ?,'PLATFORM_ADMIN',id,'ADMIN_PRIVACY_CASE_READ','PRIVACY_CASE',?,'SUCCESS',?,?,ARRAY['metadata'],?,? FROM platform_account WHERE id=?":"INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,organization_id,country) SELECT ?,'BUSINESS',id,'PRIVACY_CASE_REQUESTED','PRIVACY_CASE',?,'SUCCESS',?,?,ARRAY['state'],?,? FROM business_account WHERE id=? AND organization_id=?";
        var args=new ArrayList<Object>(Arrays.asList(ids.next(),resource,requestId(),Timestamp.from(now()),org,country,actor));if(!admin)args.add(org);
        if(jdbc.update(sql,args.toArray())!=1)throw new IllegalStateException("Privacy audit actor unavailable");
    }
    private UUID requestId(){String value=MDC.get("requestId");if(value!=null){try{UUID id=UUID.fromString(value);if(id.version()==7&&id.variant()==2&&id.toString().equals(value))return id;}catch(IllegalArgumentException ignored){}}return ids.next();}
    private static byte[] digest(Command c){try{return MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsString(List.of(c.kind(),c.reason())).getBytes(StandardCharsets.UTF_8));}catch(NoSuchAlgorithmException e){throw new IllegalStateException("Digest unavailable");}}
    private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
    private static String time(Instant at){return new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(at);}
    private record Receipt(UUID actor,UUID organization,String country,byte[] digest,Instant created,String original){@Override public String toString(){return "PrivacyReceipt[redacted]";}}
}
