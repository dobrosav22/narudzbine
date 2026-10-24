package com.narudzbine.identity.application;

import com.narudzbine.identity.api.*;
import com.narudzbine.audit.api.SetupAudit;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static com.narudzbine.identity.application.SetupInvitationStore.*;

public final class SetupInvitationService {
    private final SetupInvitationStore store;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final SessionService sessions;
    private final LoginThrottle throttle;
    private final SetupAudit audit;
    private final com.narudzbine.trading.api.TradingConnections trading;
    public SetupInvitationService(SetupInvitationStore store,PlatformTransactionManager manager,SessionService sessions,LoginThrottle throttle,SetupAudit audit,com.narudzbine.trading.api.TradingConnections trading){this.store=store;jdbc=store.jdbc;tx=new TransactionTemplate(manager);tx.setTimeout(10);this.sessions=sessions;this.throttle=throttle;this.audit=audit;this.trading=trading;}
    public Creation invite(String token,SessionTransport transport,String csrf,String recipient,String country,String type,UUID plan,String reason){
        LoginThrottle.requireNoTransaction();UUID sender=admitAdmin(token,transport);
        return tx.execute(status->{admin(token,transport,csrf);
            jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,18002))",r->{},sender+"/"+recipient+"/"+country+"/"+type);
            var pending=jdbc.queryForList("SELECT id FROM setup_invitation WHERE sender_id=? AND recipient_email=? AND country=? AND type=? AND state='PENDING' AND purpose='ORGANIZATION' FOR UPDATE",UUID.class,sender,recipient,country,type);
            if(!pending.isEmpty()){Row old=store.read(pending.getFirst());if(store.now().isBefore(old.instant("expires_at"))){if(!Objects.equals(plan,old.id("plan_revision_id"))){throw fail(SetupFailure.Reason.IDEMPOTENCY_MISMATCH);}return new Creation(store.view(old),true);}
                if(store.busy(old)){throw fail(SetupFailure.Reason.REQUEST_IN_PROGRESS);}jdbc.update("UPDATE setup_invitation SET state='EXPIRED',revision=revision+1,updated_at=? WHERE id=?",time(store.now()),old.id("id"));store.invalidateProofs(old.id("id"));}
            if(type.equals("VENDOR")){if(plan==null||jdbc.queryForList("SELECT id FROM plan_revision WHERE id=? AND NOT retired FOR SHARE",UUID.class,plan).isEmpty()){throw fail(SetupFailure.Reason.INVALID_STATE);}}
            else if(plan!=null){throw new IllegalArgumentException("Buyer plan must be null.");}
            UUID id=store.ids.next();String secret=SessionSecrets.generate();var now=store.now();
            jdbc.update("INSERT INTO setup_invitation(id,sender_id,recipient_email,country,type,plan_revision_id,reason,token_hash,state,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,'PENDING',?,?,?)",id,sender,recipient,country,type,plan,reason,SessionSecrets.hash(secret),time(now),time(now),time(now.plus(7,ChronoUnit.DAYS)));
            Row invitation=store.read(id);store.deliver(invitation,secret,null);audit.setup(sender,id,"SETUP_INVITED",reason);sessions.recordSuccessfulActivity(token,transport);return new Creation(store.view(invitation),false);
        });
    }
    public Invitation get(String token,SessionTransport transport,UUID id){LoginThrottle.requireNoTransaction();UUID actor=tx.execute(status->sessions.authenticate(token,transport).accountId());throttle.admitApi(actor,false);
        return tx.execute(status->{var p=sessions.authenticate(token,transport);Row i=store.read(id);boolean recipient=jdbc.queryForObject("SELECT count(*) FROM account_identity WHERE id=? AND email=? AND email_verified",Integer.class,actor,i.text("recipient_email"))==1;
            if(!(p.platformAdministrator()&&actor.equals(i.id("sender_id")))&&!memberReader(actor,i)&&!recipient){throw fail(SetupFailure.Reason.NOT_FOUND);}sessions.recordSuccessfulActivity(token,transport);return store.view(i);});}
    public void revoke(String token,SessionTransport transport,String csrf,UUID id){LoginThrottle.requireNoTransaction();UUID actor=admitSender(token,transport,id);
        tx.executeWithoutResult(status->{sender(token,transport,csrf,id);Row i=store.lock(id);own(actor,i);if(i.text("state").equals("REVOKED")){return;}if(!i.text("state").equals("PENDING")){throw fail(SetupFailure.Reason.INVALID_STATE);}
            jdbc.update("UPDATE setup_invitation SET state='REVOKED',revision=revision+1,updated_at=? WHERE id=?",time(store.now()),id);store.invalidateProofs(id);audit.setup(actor,id,"SETUP_REVOKED","Sender revoked setup invitation");sessions.recordSuccessfulActivity(token,transport);});}
    public Invitation resend(String token,SessionTransport transport,String csrf,UUID id,String expected,UUID key){LoginThrottle.requireNoTransaction();UUID actor=admitSender(token,transport,id);
        return tx.execute(status->{if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(hashtextextended(?,18003))",Boolean.class,actor+"/"+id+"/"+key))){throw fail(SetupFailure.Reason.REQUEST_IN_PROGRESS);}
            sender(token,transport,csrf,id);Row i=store.lock(id);own(actor,i);
            var receipts=jdbc.queryForList("SELECT * FROM invitation_resend WHERE sender_id=? AND invitation_id=? AND key=?",actor,id,key);
            if(!receipts.isEmpty()){Row r=new Row(receipts.getFirst());if(!expected.equals(r.text("expected_revision"))){throw fail(SetupFailure.Reason.IDEMPOTENCY_MISMATCH);}if(!store.now().isBefore(r.instant("expires_at"))){throw fail(SetupFailure.Reason.REPLAY_EXPIRED);}
                return new Invitation(id,r.text("original_revision")==null?store.legacyRevisions.encode("invitation/v1",id,r.number("result_revision")):r.text("original_revision"),store.trading(i)?"TRADING":store.member(i)?"MEMBER":"SETUP_"+i.text("type"),i.text("recipient_email"),store.trading(i)?i.id("buyer_id"):store.member(i)?i.id("organization_id"):null,"PENDING","QUEUED",r.instant("result_expires_at"),i.instant("created_at"),r.instant("created_at"));}
            store.requireRevision(i,expected);if(store.businessOrigin(i)&&!store.senderActive(i)){throw fail(SetupFailure.Reason.INVALID_STATE);}if(!i.text("state").equals("PENDING")){throw fail(SetupFailure.Reason.INVALID_STATE);}if(store.busy(i)){throw fail(SetupFailure.Reason.REQUEST_IN_PROGRESS);}
            var now=store.now();String next=SessionSecrets.generate();jdbc.update("UPDATE setup_invitation SET token_hash=?,generation=generation+1,revision=revision+1,expires_at=?,updated_at=? WHERE id=?",SessionSecrets.hash(next),time(now.plus(7,ChronoUnit.DAYS)),time(now),id);store.invalidateProofs(id);
            Row changed=store.read(id);store.deliver(changed,next,null);jdbc.update("INSERT INTO invitation_resend(sender_id,invitation_id,key,expected_revision,result_revision,result_generation,created_at,expires_at,result_expires_at,original_revision) VALUES (?,?,?,?,?,?,?,?,?,?)",actor,id,key,expected,changed.number("revision"),changed.number("generation"),time(now),time(now.plus(7,ChronoUnit.DAYS)),time(now.plus(7,ChronoUnit.DAYS)),store.view(changed).revision());
            audit.setup(actor,id,"SETUP_RESENT","Sender explicitly resent setup invitation");sessions.recordSuccessfulActivity(token,transport);return store.view(changed);
        });}
    public void requestProof(String token,String source){LoginThrottle.requireNoTransaction();throttle.admitSetup(source);
        tx.executeWithoutResult(status->{Row i;try{i=store.token(token);i=store.lock(i.id("id"));if(store.trading(i)||!store.pending(i)){return;}}catch(SetupFailure ex){return;}
            store.invalidateProofs(i.id("id"));UUID proof=store.ids.next();String secret=SessionSecrets.generate();var expires=store.now().plusSeconds(1800);if(i.instant("expires_at").isBefore(expires)){expires=i.instant("expires_at");}
            jdbc.update("INSERT INTO setup_email_proof(id,invitation_id,generation,token_hash,state,created_at,expires_at) VALUES (?,?,?,?,'ACTIVE',?,?)",proof,i.id("id"),i.number("generation"),SessionSecrets.hash(secret),time(store.now()),time(expires));store.deliver(i,secret,proof);
        });}
    public Creation inviteMember(String token,SessionTransport transport,String csrf,String recipient,String role){
        LoginThrottle.requireNoTransaction();UUID actor=tx.execute(status->sessions.authenticate(token,transport).accountId());throttle.admitApi(actor,true);
        return tx.execute(status->{sessions.authenticateForOrganizationWrite(token,transport);if(transport==SessionTransport.BROWSER){sessions.requireCsrf(token,csrf);}Row context=memberContext(actor);requireRole(context,role);
            UUID org=context.id("organization_id");var pending=jdbc.queryForList("SELECT * FROM setup_invitation WHERE purpose='MEMBER' AND organization_id=? AND recipient_email=? AND state='PENDING' FOR UPDATE",org,recipient);
            if(!pending.isEmpty()){Row previous=new Row(pending.getFirst());if(store.now().isBefore(previous.instant("expires_at"))){if(!role.equals(previous.text("invited_role"))){throw fail(SetupFailure.Reason.IDEMPOTENCY_MISMATCH);}sessions.recordSuccessfulActivity(token,transport);return new Creation(store.view(previous),true);}
                if(store.busy(previous)){throw fail(SetupFailure.Reason.REQUEST_IN_PROGRESS);}jdbc.update("UPDATE setup_invitation SET state='EXPIRED',revision=revision+1,updated_at=? WHERE id=?",time(store.now()),previous.id("id"));store.invalidateProofs(previous.id("id"));}
            UUID id=store.ids.next();String secret=SessionSecrets.generate();var now=store.now();
            jdbc.update("INSERT INTO setup_invitation(id,sender_id,recipient_email,country,type,plan_revision_id,reason,token_hash,state,created_at,updated_at,expires_at,purpose,organization_id,invited_role) VALUES (?,?,?,?,?,NULL,?,?,'PENDING',?,?,?,'MEMBER',?,?)",id,actor,recipient,context.text("country"),context.text("type"),"Organization member invitation",SessionSecrets.hash(secret),time(now),time(now),time(now.plus(7,ChronoUnit.DAYS)),org,role);
            Row invitation=store.read(id);store.deliver(invitation,secret,null);audit.setup(actor,id,"SETUP_INVITED","Organization invited member");sessions.recordSuccessfulActivity(token,transport);return new Creation(store.view(invitation),false);
        });
    }
    public Creation inviteBuyer(String token,SessionTransport transport,String csrf,String recipient,UUID buyer){
        LoginThrottle.requireNoTransaction();Row admitted=tx.execute(status->{var p=sessions.authenticate(token,transport);Row c=memberContext(p.accountId());requireVendor(c);return new Row(new java.util.HashMap<>(Map.of("account_id",p.accountId(),"organization_id",c.id("organization_id"))));});UUID actor=admitted.id("account_id"),vendor=admitted.id("organization_id");throttle.admitApi(actor,true);
        return tx.execute(status->{if(buyer!=null){Row before=memberContext(actor);if(jdbc.queryForList("SELECT id FROM organization WHERE id=? AND type='BUYER' AND country=? AND state='ACTIVE'",UUID.class,buyer,before.text("country")).isEmpty()){throw fail(SetupFailure.Reason.NOT_FOUND);}}sessions.authenticateForTradingWrite(token,transport,vendor,buyer,actor);if(transport==SessionTransport.BROWSER){sessions.requireCsrf(token,csrf);}Row context=memberContext(actor);requireVendor(context);
            if(buyer!=null){var candidates=jdbc.queryForList("SELECT id FROM organization WHERE id=? AND type='BUYER' AND country=? AND state='ACTIVE'",UUID.class,buyer,context.text("country"));if(candidates.isEmpty()){throw fail(SetupFailure.Reason.NOT_FOUND);}var connected=trading.find(vendor,buyer);if(connected.isPresent()&&connected.get().state().equals("ACTIVE")){throw new com.narudzbine.trading.api.TradingFailure(com.narudzbine.trading.api.TradingFailure.Reason.ALREADY_CONNECTED);}}
            String purpose=buyer==null?"BUYER_SETUP":"TRADING";var pending=buyer==null?jdbc.queryForList("SELECT * FROM setup_invitation WHERE purpose='BUYER_SETUP' AND organization_id=? AND recipient_email=? AND state='PENDING' FOR UPDATE",vendor,recipient):jdbc.queryForList("SELECT * FROM setup_invitation WHERE purpose='TRADING' AND organization_id=? AND buyer_id=? AND state='PENDING' FOR UPDATE",vendor,buyer);
            if(!pending.isEmpty()){Row old=new Row(pending.getFirst());if(store.now().isBefore(old.instant("expires_at"))&&recipient.equals(old.text("recipient_email"))){sessions.recordSuccessfulActivity(token,transport);return new Creation(store.view(old),true);}if(store.busy(old)){throw fail(SetupFailure.Reason.REQUEST_IN_PROGRESS);}
                jdbc.update("UPDATE setup_invitation SET state=?,revision=revision+1,updated_at=? WHERE id=?",store.now().isBefore(old.instant("expires_at"))?"SUPERSEDED":"EXPIRED",time(store.now()),old.id("id"));store.invalidateProofs(old.id("id"));audit.setup(actor,old.id("id"),"SETUP_REVOKED","Vendor superseded prior buyer invitation");}
            UUID id=store.ids.next();String secret=SessionSecrets.generate();var now=store.now();jdbc.update("INSERT INTO setup_invitation(id,sender_id,recipient_email,country,type,plan_revision_id,reason,token_hash,state,created_at,updated_at,expires_at,purpose,organization_id,buyer_id) VALUES (?,?,?,?,'BUYER',NULL,?,?,'PENDING',?,?,?,?,?,?)",id,actor,recipient,context.text("country"),"Vendor buyer invitation",SessionSecrets.hash(secret),time(now),time(now),time(now.plus(7,ChronoUnit.DAYS)),purpose,vendor,buyer);
            Row invitation=store.read(id);store.deliver(invitation,secret,null);audit.setup(actor,id,"SETUP_INVITED","Vendor invited buyer");sessions.recordSuccessfulActivity(token,transport);return new Creation(store.view(invitation),false);
        });
    }
    private static void requireVendor(Row context){requireRole(context,"STAFF");if(!context.text("type").equals("VENDOR")){throw fail(SetupFailure.Reason.FORBIDDEN);}}
    public InvitationPage list(String token,SessionTransport transport,int page,int size,String state,boolean total){
        LoginThrottle.requireNoTransaction();UUID actor=tx.execute(status->sessions.authenticate(token,transport).accountId());throttle.admitApi(actor,false);
        return tx.execute(status->{sessions.authenticate(token,transport);Row context=memberContext(actor);requireRole(context,"STAFF");
            var rows=jdbc.queryForList("""
                    WITH filtered AS MATERIALIZED (
                        SELECT i.*,CASE WHEN state='PENDING' AND expires_at<=? THEN 'EXPIRED' ELSE state END AS effective_state
                        FROM setup_invitation i WHERE (purpose IN ('MEMBER','BUYER_SETUP','TRADING') AND organization_id=?) OR (purpose='TRADING' AND buyer_id=?)
                    ), selected AS MATERIALIZED (SELECT * FROM filtered WHERE ?::text IS NULL OR effective_state=?),
                    page AS (SELECT * FROM selected ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?)
                    SELECT p.*,t.total FROM (SELECT CASE WHEN ? THEN count(*) ELSE NULL END AS total FROM selected)t
                    LEFT JOIN page p ON true ORDER BY p.created_at DESC,p.id ASC
                    """,time(store.now()),context.id("organization_id"),context.id("organization_id"),state,state,size,Math.multiplyExact(page,size),total);
            var items=rows.stream().filter(r->r.get("id")!=null).map(r->store.view(new Row(r))).toList();sessions.recordSuccessfulActivity(token,transport);return new InvitationPage(items,(Long)rows.getFirst().get("total"));
        });
    }
    private boolean memberReader(UUID actor,Row i){return store.businessOrigin(i)&&jdbc.queryForObject("SELECT count(*) FROM business_account WHERE id=? AND organization_id IN (?,?) AND role IN ('OWNER','ADMIN')",Integer.class,actor,i.id("organization_id"),store.trading(i)?i.id("buyer_id"):null)==1;}
    private Row memberContext(UUID actor){var rows=jdbc.queryForList("SELECT b.organization_id,b.role,o.country,o.type FROM business_account b JOIN organization o ON o.id=b.organization_id WHERE b.id=? AND o.state='ACTIVE'",actor);if(rows.isEmpty()){throw fail(SetupFailure.Reason.NOT_FOUND);}return new Row(rows.getFirst());}
    private static void requireRole(Row context,String role){if(!context.text("role").equals("OWNER")&&!(context.text("role").equals("ADMIN")&&role.equals("STAFF"))){throw fail(SetupFailure.Reason.FORBIDDEN);}}
    private UUID admitSender(String token,SessionTransport transport,UUID id){UUID actor=tx.execute(status->{var p=sessions.authenticate(token,transport);Row i=store.read(id);if(store.businessOrigin(i)){Row context=memberContext(p.accountId());if(!context.id("organization_id").equals(i.id("organization_id"))){throw fail(SetupFailure.Reason.NOT_FOUND);}requireRole(context,store.member(i)?i.text("invited_role"):"STAFF");}else if(!p.platformAdministrator()){throw fail(SetupFailure.Reason.FORBIDDEN);}return p.accountId();});throttle.admitApi(actor,true);return actor;}
    private void sender(String token,SessionTransport transport,String csrf,UUID id){Row i=store.read(id);if(!store.businessOrigin(i)){admin(token,transport,csrf);return;}
        // Reject foreign context before acquiring any invitation/issuer lock.
        UUID actor=sessionsOwner(token);Row context=memberContext(actor);if(!context.id("organization_id").equals(i.id("organization_id"))){throw fail(SetupFailure.Reason.NOT_FOUND);}
        if(store.member(i)){sessions.authenticateForMemberWrite(token,transport,i.id("sender_id"));}else{sessions.authenticateForTradingWrite(token,transport,i.id("organization_id"),i.id("buyer_id"),i.id("sender_id"));}context=memberContext(actor);requireRole(context,store.member(i)?i.text("invited_role"):"STAFF");if(transport==SessionTransport.BROWSER){sessions.requireCsrf(token,csrf);}
    }
    private UUID sessionsOwner(String token){var ids=jdbc.queryForList("SELECT account_id FROM application_session WHERE token_hash=?",UUID.class,SessionSecrets.hash(token));if(ids.isEmpty()){throw new InvalidSession();}return ids.getFirst();}
    public record InvitationPage(List<Invitation> items,Long total){}
    private UUID admitAdmin(String token,SessionTransport transport){UUID actor=tx.execute(status->{var p=sessions.authenticate(token,transport);if(!p.platformAdministrator()){throw fail(SetupFailure.Reason.FORBIDDEN);}return p.accountId();});throttle.admitApi(actor,true);return actor;}
    private void admin(String token,SessionTransport transport,String csrf){var p=sessions.authenticate(token,transport);if(!p.platformAdministrator()){throw fail(SetupFailure.Reason.FORBIDDEN);}if(transport==SessionTransport.BROWSER){sessions.requireCsrf(token,csrf);}}
    private static void own(UUID actor,Row i){if("ORGANIZATION".equals(i.text("purpose"))&&!actor.equals(i.id("sender_id"))){throw fail(SetupFailure.Reason.NOT_FOUND);}}
    public record Creation(Invitation invitation,boolean replay){}
}
