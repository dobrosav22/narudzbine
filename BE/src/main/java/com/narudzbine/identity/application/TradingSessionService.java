package com.narudzbine.identity.application;
import com.narudzbine.identity.api.*;
import com.narudzbine.trading.api.*;
import com.narudzbine.audit.api.SetupAudit;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static com.narudzbine.identity.application.SetupInvitationStore.*;
public final class TradingSessionService {
    private final SetupInvitationStore store;private final SessionService sessions;private final LoginThrottle throttle;private final TradingConnections trading;private final SetupAudit audit;private final TransactionTemplate tx;private final com.narudzbine.audit.api.TradingAudit tradingAudit;private final com.narudzbine.notifications.api.RelationshipNotices notices;
    public TradingSessionService(SetupInvitationStore store,SessionService sessions,LoginThrottle throttle,TradingConnections trading,SetupAudit audit,PlatformTransactionManager manager,com.narudzbine.audit.api.TradingAudit tradingAudit,com.narudzbine.notifications.api.RelationshipNotices notices){this.store=store;this.sessions=sessions;this.throttle=throttle;this.trading=trading;this.audit=audit;this.tradingAudit=tradingAudit;this.notices=notices;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
    public TradingConnections.View accept(String secret,SessionTransport transport,String csrf,String capability){
        LoginThrottle.requireNoTransaction();UUID actor=admit(secret,transport,true);Row initial=tx.execute(status->{Row i=store.token(capability);if(!store.trading(i)){throw fail(SetupFailure.Reason.TOKEN_INVALID);}recipient(actor,i);return i;});
        return tx.execute(status->{sessions.authenticateForTradingWrite(secret,transport,initial.id("organization_id"),initial.id("buyer_id"),initial.id("sender_id"));if(transport==SessionTransport.BROWSER){sessions.requireCsrf(secret,csrf);}Row i=store.token(capability);i=store.lock(i.id("id"));recipient(actor,i);
            if(i.text("state").equals("ACCEPTED")){var rows=store.jdbc.queryForList("SELECT * FROM trading_acceptance WHERE invitation_id=?",i.id("id"));if(rows.isEmpty()){throw fail(SetupFailure.Reason.INVALID_STATE);}Row receipt=new Row(rows.getFirst());var current=trading.get(i.id("buyer_id"),receipt.id("relationship_id"));if(!current.state().equals("ACTIVE")||current.generation()!=receipt.number("connection_generation")){throw fail(SetupFailure.Reason.INVALID_STATE);}if(!store.now().isBefore(receipt.instant("expires_at"))){throw fail(SetupFailure.Reason.REPLAY_EXPIRED);}sessions.recordSuccessfulActivity(secret,transport);return new TradingConnections.View(current.id(),receipt.number("result_revision"),current.vendorId(),current.buyerId(),current.country(),"ACTIVE",null,current.generation(),(Boolean)receipt.values().get("result_confirmation"),receipt.instant("relationship_created_at"),receipt.instant("result_updated_at"));}
            store.requirePending(i);var relationship=trading.connect(i.id("organization_id"),i.id("buyer_id"),actor);store.requirePending(i);var now=store.now();
            var otherIds=store.jdbc.queryForList("SELECT id FROM setup_invitation WHERE purpose='TRADING' AND organization_id=? AND buyer_id=? AND state='PENDING' AND id<>? FOR UPDATE",UUID.class,i.id("organization_id"),i.id("buyer_id"),i.id("id"));
            for(UUID id:otherIds){store.jdbc.update("UPDATE setup_invitation SET state='SUPERSEDED',revision=revision+1,updated_at=? WHERE id=?",time(now),id);store.invalidateProofs(id);}
            store.jdbc.update("UPDATE setup_invitation SET state='ACCEPTED',revision=revision+1,updated_at=? WHERE id=?",time(now),i.id("id"));
            store.jdbc.update("INSERT INTO trading_acceptance(invitation_id,relationship_id,connection_generation,result_revision,result_confirmation,relationship_created_at,result_updated_at,completed_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)",i.id("id"),relationship.id(),relationship.generation(),relationship.revision(),relationship.confirmationRequired(),time(relationship.createdAt()),time(relationship.updatedAt()),time(now),time(now.plus(7,ChronoUnit.DAYS)));
            audit.setup(actor,i.id("id"),"SETUP_COMPLETED","Buyer accepted domestic trading connection");sessions.recordSuccessfulActivity(secret,transport);return relationship;
        });
    }
    public TradingConnections.View adminConnect(String secret,SessionTransport transport,String csrf,UUID vendor,UUID buyer,String reason){
        LoginThrottle.requireNoTransaction();UUID actor=admit(secret,transport,true);tx.executeWithoutResult(status->requirePlatform(secret,transport));
        return tx.execute(status->{
            sessions.authenticateForAdministrativeTradingWrite(secret,transport,vendor,buyer);checkCsrf(secret,transport,csrf);requireDomesticPair(vendor,buyer);
            var prior=trading.find(vendor,buyer);boolean change=prior.isEmpty()||!prior.get().state().equals("ACTIVE");
            var result=trading.connect(vendor,buyer,actor);
            if(change){closeInvitations(vendor,buyer);tradingAudit.administrativeConnection(actor,result.id(),reason);}
            sessions.recordSuccessfulActivity(secret,transport);return result;
        });
    }
    public TradingConnections.View disconnect(String secret,SessionTransport transport,String csrf,UUID id,String expected,String reason,boolean administrative){
        LoginThrottle.requireNoTransaction();UUID actor=admit(secret,transport,true);
        var initial=tx.execute(status->{
            if(administrative){requirePlatform(secret,transport);var pair=store.jdbc.queryForList("SELECT vendor_id FROM trading_relationship WHERE id=?",UUID.class,id);if(pair.isEmpty()){throw fail(SetupFailure.Reason.NOT_FOUND);}return trading.get(pair.getFirst(),id);}
            return trading.get(organization(actor),id);
        });
        return tx.execute(status->{
            if(administrative){sessions.authenticateForAdministrativeTradingWrite(secret,transport,initial.vendorId(),initial.buyerId());}
            else{sessions.authenticateForTradingWrite(secret,transport,initial.vendorId(),initial.buyerId(),actor);requireManager(actor);}
            checkCsrf(secret,transport,csrf);
            var current=trading.get(initial.vendorId(),id);
            if(!store.revisions.matches("relationship/v1",id,current.revision(),expected)){throw new com.narudzbine.identity.api.RevisionConflict(store.revisions.encode("relationship/v1",id,current.revision()));}
            boolean change=current.state().equals("ACTIVE");var result=trading.disconnect(initial.vendorId(),id,reason,actor);
            if(change){notices.disconnected(id,result.revision(),result.vendorId(),result.buyerId(),actor,result.updatedAt());}
            sessions.recordSuccessfulActivity(secret,transport);return result;
        });
    }
    private void requirePlatform(String secret,SessionTransport transport){if(!sessions.authenticate(secret,transport).platformAdministrator()){throw fail(SetupFailure.Reason.FORBIDDEN);}}
    private void requireManager(UUID actor){if(store.jdbc.queryForObject("SELECT count(*) FROM business_account WHERE id=? AND role IN ('OWNER','ADMIN')",Integer.class,actor)!=1){throw fail(SetupFailure.Reason.FORBIDDEN);}}
    private void requireDomesticPair(UUID vendor,UUID buyer){if(store.jdbc.queryForObject("SELECT count(*) FROM organization v JOIN organization b ON b.id=? WHERE v.id=? AND v.type='VENDOR' AND b.type='BUYER' AND v.country=b.country AND v.state='ACTIVE' AND b.state='ACTIVE'",Integer.class,buyer,vendor)!=1){throw fail(SetupFailure.Reason.NOT_FOUND);}}
    private void checkCsrf(String secret,SessionTransport transport,String csrf){if(transport==SessionTransport.BROWSER){sessions.requireCsrf(secret,csrf);}}
    private void closeInvitations(UUID vendor,UUID buyer){
        var pending=store.jdbc.queryForList("SELECT id FROM setup_invitation WHERE purpose='TRADING' AND organization_id=? AND buyer_id=? AND state='PENDING' ORDER BY id FOR UPDATE",UUID.class,vendor,buyer);
        for(UUID id:pending){store.jdbc.update("UPDATE setup_invitation SET state='SUPERSEDED',revision=revision+1,updated_at=? WHERE id=?",time(store.now()),id);store.invalidateProofs(id);}
    }
    public TradingConnections.Partner partner(String secret,SessionTransport transport,UUID partner){
        LoginThrottle.requireNoTransaction();UUID actor=admit(secret,transport,false);
        return tx.execute(status->{sessions.authenticate(secret,transport);var result=trading.partner(organization(actor),partner);sessions.recordSuccessfulActivity(secret,transport);return result;});
    }
    public TradingConnections.View get(String secret,SessionTransport transport,UUID id){LoginThrottle.requireNoTransaction();UUID actor=admit(secret,transport,false);return tx.execute(status->{sessions.authenticate(secret,transport);var result=trading.get(organization(actor),id);sessions.recordSuccessfulActivity(secret,transport);return result;});}
    public TradingConnections.Page list(String secret,SessionTransport transport,int page,int size,String state,boolean total){LoginThrottle.requireNoTransaction();UUID actor=admit(secret,transport,false);return tx.execute(status->{sessions.authenticate(secret,transport);var result=trading.list(organization(actor),page,size,state,total);sessions.recordSuccessfulActivity(secret,transport);return result;});}
    private UUID admit(String secret,SessionTransport transport,boolean write){UUID actor=tx.execute(status->sessions.authenticate(secret,transport).accountId());throttle.admitApi(actor,write);return actor;}
    private UUID organization(UUID actor){var rows=store.jdbc.queryForList("SELECT organization_id FROM business_account WHERE id=?",UUID.class,actor);if(rows.isEmpty()){throw fail(SetupFailure.Reason.NOT_FOUND);}return rows.getFirst();}
    private void recipient(UUID actor,Row i){if(!store.trading(i)||store.jdbc.queryForObject("SELECT count(*) FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id WHERE a.id=? AND a.state='ACTIVE' AND a.email_verified AND a.email=? AND b.organization_id=? AND b.role IN ('OWNER','ADMIN') AND o.state='ACTIVE' AND o.type='BUYER' AND o.country=?",Integer.class,actor,i.text("recipient_email"),i.id("buyer_id"),i.text("country"))!=1){throw fail(SetupFailure.Reason.FORBIDDEN);}}
}
