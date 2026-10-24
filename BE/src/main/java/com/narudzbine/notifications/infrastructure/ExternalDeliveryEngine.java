package com.narudzbine.notifications.infrastructure;

import com.narudzbine.notifications.api.ProviderDelivery;
import com.narudzbine.shared.api.SecretEnvelope;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Durable fenced external attempts. Every external invocation is after the authorization transaction completes. */
public final class ExternalDeliveryEngine implements AutoCloseable {
    private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;private final TransactionTemplate tx,compactionTx;
    private final ProviderDelivery.Email email;private final ProviderDelivery.Push push;private final ProviderDelivery.Devices devices;private final ProviderDelivery.TechnicalEmails technical;
    private final SecretEnvelope bodies;private final String from,base;private final JsonMapper json=JsonMapper.builder().build();
    private final ExecutorService emailPool=Executors.newFixedThreadPool(4),pushPool=Executors.newFixedThreadPool(4);
    public ExternalDeliveryEngine(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,PlatformTransactionManager manager,ProviderDelivery.Email email,ProviderDelivery.Push push,ProviderDelivery.Devices devices,ProviderDelivery.TechnicalEmails technical,byte[] bodyKey,String from,String base){
        this.jdbc=jdbc;this.clock=clock;this.ids=ids;this.email=email;this.push=push;this.devices=devices;this.technical=technical;this.from=from;this.base=base.replaceAll("/+$","");bodies=new SecretEnvelope(bodyKey,"external-request/v1");tx=new TransactionTemplate(manager);tx.setTimeout(10);compactionTx=new TransactionTemplate(manager);compactionTx.setTimeout(10);compactionTx.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        var uri=java.net.URI.create(base);if(base.length()>512||base.contains("unconfigured.invalid")||!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getQuery()!=null||uri.getFragment()!=null||uri.getUserInfo()!=null||!from.matches("[^\\s<>@]+@[^\\s<>@]+"))throw new IllegalArgumentException("Explicit HTTPS app base and sender mailbox required");
        if(email==null&&push==null||push!=null&&devices==null||email!=null&&technical==null)throw new IllegalArgumentException("Delivery ports unavailable");
    }
    public void close(){emailPool.shutdownNow();pushPool.shutdownNow();}
    public int materialize(){
        var routes=jdbc.queryForList("SELECT s.kind,s.id FROM external_delivery_source s WHERE NOT EXISTS(SELECT 1 FROM external_fanout f WHERE f.source_kind=s.kind AND f.source_id=s.id) AND ((s.channel='EMAIL' AND ?) OR(s.channel='PUSH' AND ?)) ORDER BY s.created_at,s.id LIMIT 50",email!=null,push!=null);int count=0;
        for(var route:routes)if(Boolean.TRUE.equals(tx.execute(t->{var source=source((String)route.get("kind"),(UUID)route.get("id"));if(source==null||!available(source))return false;scope(source);Instant at=now();
            if(jdbc.update("INSERT INTO external_fanout(source_kind,source_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING",source.get("kind"),source.get("id"),time(at))!=1)return false;
            if(!at.isBefore(instant(source,"expires_at")))job(source,null,"EXPIRED",at);
            else if("EMAIL".equals(source.get("channel")))job(source,null,"QUEUED",at);
            else {requirePushBinding();var targets=jdbc.queryForList("SELECT id FROM push_device_eligibility WHERE account_id=? AND environment=? AND eligible AND absolute_expires_at>? AND idle_expires_at>? ORDER BY id",UUID.class,source.get("account_id"),push.environment(),time(at),time(at));if(targets.isEmpty())job(source,null,"SUPPRESSED",at);else for(UUID target:targets)job(source,target,"QUEUED",at);}
            return true;})))count++;
        return count;
    }
    private boolean available(Map<String,Object> s){return "EMAIL".equals(s.get("channel"))?email!=null:push!=null;}
    private void job(Map<String,Object> s,UUID device,String state,Instant at){jdbc.update("INSERT INTO external_job(id,source_kind,source_id,channel,device_id,state,next_attempt_at,terminal_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)",ids.next(),s.get("kind"),s.get("id"),s.get("channel"),device,state,time(at),!state.equals("QUEUED")?time(at):null,time(at));}
    public int tick(){
        materialize();var futures=new ArrayList<Future<Boolean>>();for(String channel:List.of("EMAIL","PUSH")){if(channel.equals("EMAIL")?email==null:push==null)continue;var candidates=jdbc.queryForList("SELECT id FROM external_job WHERE channel=? AND ((state='QUEUED' AND next_attempt_at<=?) OR (state='SENDING' AND lease_until<=?)) ORDER BY next_attempt_at,created_at,id LIMIT 25",UUID.class,channel,time(now()),time(now()));for(UUID id:candidates)futures.add((channel.equals("EMAIL")?emailPool:pushPool).submit(()->process(id)));}
        int count=0;boolean failed=false;for(var future:futures){try{if(future.get(150,TimeUnit.SECONDS))count++;}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Delivery batch interrupted");}catch(ExecutionException e){failed=true;}catch(TimeoutException e){future.cancel(true);failed=true;}}
        if(failed)throw new IllegalStateException("Delivery batch deferred");compact();return count;
    }
    /** Clear only expired terminal request caches; source and provider outcome evidence remain. */
    public int compact(){return compactionTx.execute(t->jdbc.update("WITH expired AS(SELECT id FROM external_job WHERE rendered_body IS NOT NULL AND state IN('ACCEPTED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED','EXPIRED') AND terminal_at<=? ORDER BY terminal_at,id LIMIT 1000 FOR UPDATE SKIP LOCKED) UPDATE external_job j SET rendered_body=NULL FROM expired e WHERE j.id=e.id",time(now().minusSeconds(7L*86400))));}
    public boolean process(UUID id){
        Attempt attempt=tx.execute(t->claim(id));if(attempt==null)return false;
        ProviderDelivery.Result result;
        try{result=attempt.channel().equals("EMAIL")?email.send(id,attempt.mail()):push.send(attempt.address().token(),attempt.pushData());}
        catch(RuntimeException unknown){result=ProviderDelivery.Result.of(ProviderDelivery.Status.UNKNOWN);}
        var outcome=result;tx.executeWithoutResult(t->finish(attempt,outcome));return true;
    }
    private Attempt claim(UUID id){
        var route=jdbc.queryForList("SELECT source_kind,source_id FROM external_job WHERE id=?",id);if(route.isEmpty())return null;var source=source((String)route.getFirst().get("source_kind"),(UUID)route.getFirst().get("source_id"));if(source==null||!available(source))return null;scope(source);Instant at=now();
        var rows=jdbc.queryForList("SELECT * FROM external_job WHERE id=? AND ((state='QUEUED' AND next_attempt_at<=?) OR (state='SENDING' AND lease_until<=?)) FOR UPDATE SKIP LOCKED",id,time(at),time(at));if(rows.isEmpty())return null;var w=rows.getFirst();boolean reclaimed="SENDING".equals(w.get("state"));boolean manual=(Boolean)source.get("manual");
        if(reclaimed&&manual){terminal(id,"UNKNOWN",at);return null;}
        if(!at.isBefore(instant(source,"expires_at"))){terminal(id,reclaimed?"UNKNOWN":"EXPIRED",at);return null;}
        int attempts=((Number)w.get("attempts")).intValue();if(attempts>=6||w.get("first_attempt_at")!=null&&!at.isBefore(instant(w,"first_attempt_at").plusSeconds(23*3600))){terminal(id,"UNKNOWN",at);return null;}
        if(source.get("kind").toString().startsWith("NOTICE_")&&Boolean.TRUE.equals(jdbc.queryForObject("SELECT credential_operation_pending FROM account_identity WHERE id=?",Boolean.class,source.get("account_id"))))return null;
        ProviderDelivery.Technical content=null;
        if(source.get("kind").toString().startsWith("NOTICE_")&&!eligible(source)){terminal(id,"SUPPRESSED",at);return null;}
        if(Set.of("SETUP","RESET","EMAIL_PROOF","RECOVERY").contains(source.get("kind"))){content=technical.resolve((String)source.get("kind"),(UUID)source.get("id"));if(content==null){terminal(id,"SUPPRESSED",at);return null;}}
        ProviderDelivery.Devices.Address address=null;String destination=null;String channel=(String)source.get("channel");
        if(channel.equals("PUSH")){requirePushBinding();if(w.get("device_id")==null||(address=devices.address((UUID)source.get("account_id"),(UUID)w.get("device_id")))==null){terminal(id,"SUPPRESSED",at);return null;}}
        else destination=content!=null?content.to():source.get("destination_email")!=null?(String)source.get("destination_email"):jdbc.queryForObject("SELECT email FROM account_identity WHERE id=?",String.class,source.get("account_id"));
        String event=content==null?(String)source.get("event_key"):content.event(),locale=content==null?(String)source.get("locale"):content.locale();
        String link=content==null?base+"/#/"+(Set.of("NOTICE_ORDER","NOTICE_MESSAGE").contains(source.get("kind"))?"orders/"+source.get("resource_id"):source.get("kind").equals("NOTICE_RELATIONSHIP")?"relationships/"+source.get("resource_id"):"notifications/"+source.get("notice_id")):content.link();long expiry=content==null?0:content.expiryMinutes();ProviderDelivery.Mail mail;Map<String,String> data;
        if(w.get("rendered_body")!=null){var cached=json.readValue(bodies.decrypt(id,(byte[])w.get("rendered_body")),Rendered.class);mail=cached.mail();data=cached.pushData();if(channel.equals("EMAIL")&&!mail.to().equals(destination)){terminal(id,"SUPPRESSED",at);return null;}}
        else {String organization="Narudzbine",reference="";if(source.get("notice_id")!=null){var notice=jdbc.queryForMap("SELECT organization_name,order_reference FROM inbox_source WHERE id=? AND source_kind=?",source.get("notice_id"),source.get("kind").toString().replace("NOTICE_",""));organization=(String)notice.get("organization_name");reference=(String)notice.get("order_reference");}
            var render=DeliveryText.render(locale,event,organization,reference,link,expiry);mail=new ProviderDelivery.Mail(from,destination==null?"":destination,render.subject(),render.text(),render.html());
            data=Map.of("version","1","kind","ACTIVITY","event",event,"organizationName",organization,"organizationId",source.get("organization_id")==null?"":source.get("organization_id").toString(),"orderReference",reference,"resourceId",source.get("resource_id").toString(),"link",link,"preview",render.subject());
            jdbc.update("UPDATE external_job SET rendered_body=?,rendered_destination=? WHERE id=?",bodies.encrypt(id,json.writeValueAsBytes(new Rendered(mail,data))),destination,id);
        }
        UUID fence=ids.next();jdbc.update("UPDATE external_job SET state='SENDING',attempts=attempts+1,fence=?,lease_until=?,first_attempt_at=COALESCE(first_attempt_at,?),attempted_device_revision=?,attempted_token_hash=?,terminal_at=NULL WHERE id=?",fence,time(at.plusSeconds(60)),time(at),address==null?null:address.revision(),address==null?null:address.tokenHash(),id);
        return new Attempt(id,fence,channel,(String)source.get("kind"),(UUID)source.get("id"),(UUID)source.get("account_id"),manual,mail,address,data);
    }
    private void finish(Attempt a,ProviderDelivery.Result result){
        var source=source(a.kind(),a.source());if(source==null)return;scope(source);if(a.channel().equals("EMAIL")&&result.reference()!=null)EmailCallbacks.advisory(jdbc,result.reference());var rows=jdbc.queryForList("SELECT * FROM external_job WHERE id=? AND state='SENDING' AND fence=? FOR UPDATE",a.id(),a.fence());if(rows.isEmpty())return;var job=rows.getFirst();Instant at=now();
        if(result.status()==ProviderDelivery.Status.INVALID_TOKEN&&a.address()!=null)devices.invalid(a.account(),a.address().id(),a.address().revision(),a.address().tokenHash());
        if(result.status()==ProviderDelivery.Status.ACCEPTED){jdbc.update("UPDATE external_job SET state='ACCEPTED',provider_reference=?,fence=NULL,lease_until=NULL,terminal_at=? WHERE id=?",result.reference(),time(at),a.id());reconcileCallbacks(a.id(),result.reference());return;}
        if(a.manual()||result.status()==ProviderDelivery.Status.REJECTED||result.status()==ProviderDelivery.Status.INVALID_TOKEN){terminal(a.id(),result.status()==ProviderDelivery.Status.UNKNOWN||result.status()==ProviderDelivery.Status.RETRY?"UNKNOWN":"FAILED",at);return;}
        int tries=((Number)job.get("attempts")).intValue();long[] offsets={0,30,120,600,3600,21600};
        if(tries>=6){terminal(a.id(),"UNKNOWN",at);return;}
        long jitter=Math.floorMod(a.id().getLeastSignificantBits()^tries,41)-20;long seconds=offsets[tries]*(100+jitter)/100;Instant next=instant(job,"first_attempt_at").plusSeconds(seconds);if(next.isBefore(at.plusSeconds(result.retryAfterSeconds())))next=at.plusSeconds(result.retryAfterSeconds());
        if(!next.isBefore(instant(source,"expires_at"))||!next.isBefore(instant(job,"first_attempt_at").plusSeconds(23*3600))){terminal(a.id(),"UNKNOWN",at);return;}
        jdbc.update("UPDATE external_job SET state='QUEUED',fence=NULL,lease_until=NULL,next_attempt_at=? WHERE id=?",time(next),a.id());
    }
    void reconcileCallbacks(UUID job,String reference){if(reference==null)return;var events=jdbc.queryForList("SELECT event_type FROM email_callback WHERE provider_reference::text=? ORDER BY received_at,id",String.class,reference);if(events.contains("email.delivered"))jdbc.update("UPDATE external_job SET state='DELIVERED' WHERE id=? AND state IN('ACCEPTED','UNKNOWN')",job);else if(events.stream().anyMatch(Set.of("email.bounced","email.complained","email.failed")::contains))jdbc.update("UPDATE external_job SET state='FAILED' WHERE id=? AND state IN('ACCEPTED','UNKNOWN')",job);}
    private void terminal(UUID id,String state,Instant at){jdbc.update("UPDATE external_job SET state=?,fence=NULL,lease_until=NULL,terminal_at=? WHERE id=?",state,time(at),id);}
    private boolean eligible(Map<String,Object> s){
        var n=jdbc.queryForMap("SELECT * FROM inbox_source WHERE id=? AND source_kind=?",s.get("notice_id"),s.get("kind").toString().replace("NOTICE_", ""));UUID account=(UUID)s.get("account_id"),org=(UUID)s.get("organization_id");if(account.equals(n.get("actor_id")))return false;
        var members=jdbc.queryForList("SELECT b.role FROM business_account b JOIN account_identity a ON a.id=b.id JOIN organization o ON o.id=b.organization_id WHERE b.id=? AND b.organization_id=? AND a.state='ACTIVE' AND a.email_verified AND o.state='ACTIVE'",account,org);if(members.isEmpty())return false;
        String flag=s.get("channel").equals("EMAIL")?"email":"push";if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT COALESCE((SELECT "+flag+" FROM notification_preference WHERE account_id=? AND event_key=?),false)",Boolean.class,account,s.get("event_key"))))return false;
        String role=(String)members.getFirst().get("role");if(s.get("kind").equals("NOTICE_RELATIONSHIP"))return Set.of("OWNER","ADMIN").contains(role);
        if(s.get("kind").equals("NOTICE_ORDER")){var order=jdbc.queryForMap("SELECT vendor_id,buyer_id,submitted_by FROM purchase_order WHERE id=?",n.get("order_id"));return org.equals(order.get("vendor_id"))||org.equals(order.get("buyer_id"))&&(account.equals(order.get("submitted_by"))||Set.of("OWNER","ADMIN").contains(role));}
        return s.get("kind").equals("NOTICE_MESSAGE");
    }
    private Map<String,Object> source(String kind,UUID id){var r=jdbc.queryForList("SELECT * FROM external_delivery_source WHERE kind=? AND id=?",kind,id);return r.isEmpty()?null:r.getFirst();}
    private void scope(Map<String,Object> source){
        jdbc.queryForList("SELECT id FROM organization WHERE id IN (?,?) ORDER BY id FOR UPDATE",UUID.class,source.get("organization_id"),source.get("other_organization_id"));
        var accounts=new HashSet<UUID>();accounts.add((UUID)source.get("account_id"));if(source.get("kind").equals("RECOVERY")){var c=jdbc.queryForMap("SELECT creator_id,reviewer_id,target_id,former_owner_id FROM recovery_case WHERE id=?",source.get("resource_id"));for(Object id:c.values())if(id!=null)accounts.add((UUID)id);}
        String parameters=String.join(",",Collections.nCopies(accounts.size(),"?"));jdbc.queryForList("SELECT id FROM account_identity WHERE id IN ("+parameters+") ORDER BY id FOR UPDATE",UUID.class,accounts.toArray());
    }
    private void requirePushBinding(){var bindings=jdbc.queryForList("SELECT environment,project_id FROM device_registry_guard WHERE id=1");if(!bindings.isEmpty()&&bindings.getFirst().get("environment")==null&&jdbc.queryForObject("SELECT count(*) FROM push_device WHERE enabled",Integer.class)==0)return;if(bindings.isEmpty()||!push.environment().equals(bindings.getFirst().get("environment"))||!push.projectId().equals(bindings.getFirst().get("project_id")))throw new IllegalStateException("Push database binding unavailable");}
    private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}private static Instant instant(Map<String,Object> row,String key){return ((Timestamp)row.get(key)).toInstant();}private static Timestamp time(Instant at){return Timestamp.from(at);}
    record Rendered(ProviderDelivery.Mail mail,Map<String,String> pushData){@Override public String toString(){return "Rendered[redacted]";}}
    private record Attempt(UUID id,UUID fence,String channel,String kind,UUID source,UUID account,boolean manual,ProviderDelivery.Mail mail,ProviderDelivery.Devices.Address address,Map<String,String> pushData){@Override public String toString(){return "DeliveryAttempt[redacted]";}}
}
