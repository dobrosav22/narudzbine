package com.narudzbine.notifications.infrastructure;

import com.narudzbine.notifications.api.NotificationRetention;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcNotificationRetention implements NotificationRetention {
    private static final String JOB_ELIGIBLE="""
        NOT j.metadata_retired AND j.state IN('DELIVERED','FAILED','SUPPRESSED','EXPIRED')
        AND j.terminal_at<=? AND j.created_at<=? AND j.rendered_body IS NULL
        AND NOT EXISTS(SELECT 1 FROM email_callback c WHERE c.provider_reference::text=j.provider_reference
            AND NOT c.metadata_retired AND c.received_at>?)
        """;
    private static final String CALLBACK_ELIGIBLE="""
        NOT c.metadata_retired AND c.received_at<=?
        AND NOT EXISTS(SELECT 1 FROM external_job j WHERE j.provider_reference=c.provider_reference::text AND NOT j.metadata_retired)
        AND NOT EXISTS(SELECT 1 FROM external_job j WHERE j.channel='EMAIL' AND j.provider_reference IS NULL
            AND j.state IN('SENDING','ACCEPTED','UNKNOWN'))
        """;
    private final JdbcTemplate jdbc;private final Clock clock;
    public JdbcNotificationRetention(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
    private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
    private Timestamp cutoff(){return Timestamp.from(now().minus(Duration.ofDays(90)));}
    public int inbox(){
        Instant at=now();Timestamp cutoff=Timestamp.from(at.minus(Duration.ofDays(90))),current=Timestamp.from(at);
        var published=jdbc.queryForList("""
            WITH targets AS(
                SELECT w.id FROM inbox_work w JOIN notification n ON n.id=w.id
                WHERE NOT w.retired AND w.state='PUBLISHED' AND w.created_at<=? AND w.completed_at<=?
                ORDER BY w.created_at,w.id LIMIT 1000 FOR UPDATE OF w,n SKIP LOCKED
            ) UPDATE inbox_work w SET retired=true,organization_name=NULL,order_reference=NULL
              FROM targets t WHERE w.id=t.id RETURNING w.id
            """,UUID.class,cutoff,current);
        if(!published.isEmpty()&&jdbc.update("DELETE FROM notification WHERE id=ANY(?)",(Object)published.toArray(UUID[]::new))!=published.size())throw new IllegalStateException("Inbox retirement incomplete");
        int remaining=1000-published.size();
        int unpublished=remaining==0?0:jdbc.update("""
            WITH targets AS(
                SELECT w.id FROM inbox_work w WHERE NOT w.retired AND w.state IN('SUPPRESSED','EXPIRED')
                AND w.created_at<=? AND w.completed_at<=? ORDER BY w.created_at,w.id LIMIT ? FOR UPDATE OF w SKIP LOCKED
            ) UPDATE inbox_work w SET retired=true,organization_name=NULL,order_reference=NULL FROM targets t WHERE w.id=t.id
            """,cutoff,current,remaining);
        return published.size()+unpublished;
    }
    public int deliveries(){
        Timestamp cutoff=cutoff();
        var candidates=jdbc.query("SELECT j.id,j.provider_reference FROM external_job j WHERE "+JOB_ELIGIBLE+" ORDER BY j.terminal_at,j.id LIMIT 1000",(r,n)->new Job(r.getObject("id",UUID.class),r.getString("provider_reference")),cutoff,cutoff,cutoff);
        int count=0;
        for(var candidate:candidates){
            if(!guard(candidate.reference()))continue;
            var locked=jdbc.queryForList("SELECT j.id FROM external_job j WHERE j.id=? AND "+JOB_ELIGIBLE+" FOR UPDATE OF j SKIP LOCKED",UUID.class,candidate.id(),cutoff,cutoff,cutoff);
            if(locked.isEmpty())continue;
            count+=jdbc.update("""
                UPDATE external_job SET metadata_retired=true,attempts=NULL,next_attempt_at=NULL,first_attempt_at=NULL,
                  rendered_destination=NULL,attempted_device_revision=NULL,attempted_token_hash=NULL,provider_reference=NULL WHERE id=?
                """,candidate.id());
        }
        return count;
    }
    public int callbacks(){
        Timestamp cutoff=cutoff();
        var candidates=jdbc.query("SELECT c.id,c.provider_reference FROM email_callback c WHERE "+CALLBACK_ELIGIBLE+" ORDER BY c.received_at,c.id LIMIT 1000",(r,n)->new Callback(r.getString("id"),r.getObject("provider_reference",UUID.class)),cutoff);
        int count=0;
        for(var candidate:candidates){
            if(!guard(candidate.reference().toString()))continue;
            var locked=jdbc.queryForList("SELECT c.id FROM email_callback c WHERE c.id=? AND "+CALLBACK_ELIGIBLE+" FOR UPDATE OF c SKIP LOCKED",String.class,candidate.id(),cutoff);
            if(locked.isEmpty())continue;
            count+=jdbc.update("UPDATE email_callback SET metadata_retired=true,provider_reference=NULL,event_type=NULL,received_at=NULL WHERE id=?",candidate.id());
        }
        return count;
    }
    private boolean guard(String reference){return reference==null||Boolean.TRUE.equals(jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(hashtextextended(?,0))",Boolean.class,"resend/"+reference));}
    private record Job(UUID id,String reference){}
    private record Callback(String id,UUID reference){}
}
