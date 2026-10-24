package com.narudzbine.identity.application;

import com.narudzbine.identity.api.*;
import com.narudzbine.audit.api.SetupAudit;
import com.narudzbine.organizations.api.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import static com.narudzbine.identity.application.SetupInvitationStore.*;

public final class OrganizationSetupService {
    private final SetupInvitationStore store;
    private final TransactionTemplate tx;
    private final SetupCredentialProvider provider;
    private final LoginThrottle throttle;
    private final SetupAudit audit;
    private final com.narudzbine.trading.api.TradingConnections trading;
    private final JsonMapper json=JsonMapper.builder().build();
    public OrganizationSetupService(SetupInvitationStore store,PlatformTransactionManager manager,SetupCredentialProvider provider,LoginThrottle throttle,SetupAudit audit,com.narudzbine.trading.api.TradingConnections trading){this.store=store;tx=new TransactionTemplate(manager);tx.setTimeout(10);this.provider=provider;this.throttle=throttle;this.audit=audit;this.trading=trading;}
    public Result complete(String token,String proof,String password,Values values,String source){
        return execute(token,proof,password,values,source,false);
    }
    public Result completeMember(String token,String proof,String password,String displayName,String source){return execute(token,proof,password,new Values(displayName,null,null,null,null,null,null),source,true);}
    private Result execute(String token,String proof,String password,Values values,String source,boolean member){
        LoginThrottle.requireNoTransaction();LoginInput.password(password);throttle.admitSetup(source);
        String payload=json.writeValueAsString(values);byte[] digest=hash((member?"member-setup/v1\n":"organization-setup/v1\n")+payload);
        Prepared prepared=tx.execute(status->{Row invitation=store.token(token);invitation=store.lock(invitation.id("id"));
            if(store.trading(invitation)||store.member(invitation)!=member){throw fail(SetupFailure.Reason.TOKEN_INVALID);}
            var intents=store.jdbc.queryForList("SELECT * FROM setup_intent WHERE invitation_id=? AND state<>'REJECTED' FOR UPDATE",invitation.id("id"));
            Row intent=intents.isEmpty()?null:new Row(intents.getFirst());Row mailbox=proof(invitation,proof,intent!=null&&intent.text("state").equals("COMPLETED"));
            if(intent!=null){if(!MessageDigest.isEqual(intent.bytes("request_digest"),digest)){throw fail(SetupFailure.Reason.IDEMPOTENCY_MISMATCH);}
                if(intent.text("state").equals("COMPLETED")){authorizeReplay(invitation,intent);return new Prepared(invitation,intent,true,false);}
                store.requirePending(invitation);if(intent.text("state").equals("BLOCKED")){throw fail(SetupFailure.Reason.INVALID_STATE);}use(mailbox);return new Prepared(invitation,intent,false,false);
            }
            store.requirePending(invitation);if(!mailbox.text("state").equals("ACTIVE")){throw fail(SetupFailure.Reason.TOKEN_INVALID);}
            if(!member&&!values.address().country().name().equals(invitation.text("country"))){throw new IllegalArgumentException("Address country must match invitation.");}
            if(store.buyerSetup(invitation)){trading.requireCapacity(invitation.id("organization_id"));}
            guards(invitation,values);vacate(invitation.text("recipient_email"));
            if(store.jdbc.queryForObject("SELECT (SELECT count(*) FROM login_email_claim WHERE email=?)+(SELECT count(*) FROM setup_email_claim WHERE email=?)",Integer.class,invitation.text("recipient_email"),invitation.text("recipient_email"))!=0){throw fail(SetupFailure.Reason.EMAIL_UNAVAILABLE);}
            if(!member&&store.jdbc.queryForObject("SELECT (SELECT count(*) FROM organization WHERE country=? AND type=? AND normalized_registration_identifier=?)+(SELECT count(*) FROM setup_registration_claim WHERE country=? AND type=? AND identifier=?)",Integer.class,invitation.text("country"),invitation.text("type"),normalized(values.registrationIdentifier()),invitation.text("country"),invitation.text("type"),normalized(values.registrationIdentifier()))!=0){throw fail(SetupFailure.Reason.REGISTRATION_UNAVAILABLE);}
            store.requirePending(invitation);proof(invitation,proof,false);
            UUID id=store.ids.next(),account=store.ids.next(),org=member?invitation.id("organization_id"):store.ids.next(),candidate=store.ids.next();var now=store.now();
            store.jdbc.update("INSERT INTO setup_intent(id,invitation_id,generation,tenant_id,provider_user_id,account_id,organization_id,payload,request_digest,state,created_at,updated_at,member_setup) VALUES (?,?,?,?,?,?,?,?,?,'PREPARED',?,?,?)",id,invitation.id("id"),invitation.number("generation"),provider.tenant(),candidate,account,org,payload,digest,time(now),time(now),member);
            store.jdbc.update("INSERT INTO setup_email_claim(email,intent_id) VALUES (?,?)",invitation.text("recipient_email"),id);
            if(!member){store.jdbc.update("INSERT INTO setup_registration_claim(country,type,identifier,intent_id) VALUES (?,?,?,?)",invitation.text("country"),invitation.text("type"),normalized(values.registrationIdentifier()),id);}
            use(mailbox);audit.setup(invitation.id("sender_id"),id,"SETUP_PREPARED","Verified intended recipient prepared organization setup");return new Prepared(invitation,intent(id),false,true);
        });
        if(prepared.replay()){return result(prepared.invitation(),prepared.intent(),true);}
        Row intent=prepared.intent();var candidate=new PasswordCredentialVerifier.Subject(intent.id("tenant_id"),intent.id("provider_user_id"));
        SetupCredentialProvider.Outcome outcome;
        if(intent.text("state").equals("APPLIED")){outcome=SetupCredentialProvider.Outcome.APPLIED;}
        else {try{outcome=prepared.dispatch()?provider.create(candidate,intent.id("id"),prepared.invitation().text("recipient_email"),password):provider.reconcile(candidate,intent.id("id"),prepared.invitation().text("recipient_email"));}catch(RuntimeException ex){outcome=SetupCredentialProvider.Outcome.UNKNOWN;}
            if(outcome==null){outcome=SetupCredentialProvider.Outcome.UNKNOWN;}observe(prepared,outcome);}
        if(outcome==SetupCredentialProvider.Outcome.POLICY_REJECTED){throw fail(SetupFailure.Reason.PASSWORD_REJECTED);}if(outcome!=SetupCredentialProvider.Outcome.APPLIED){throw fail(SetupFailure.Reason.DEPENDENCY_UNAVAILABLE);}
        Result completed=tx.execute(status->finish(prepared,token,proof));if(completed==null){throw fail(SetupFailure.Reason.INVALID_STATE);}return completed;
    }
    private void observe(Prepared p,SetupCredentialProvider.Outcome outcome){tx.executeWithoutResult(status->{Row invitation=store.lock(p.invitation().id("id"));Row intent=intent(p.intent().id("id"));if(Set.of("APPLIED","COMPLETED","BLOCKED","REJECTED").contains(intent.text("state"))){return;}
        String state=outcome==SetupCredentialProvider.Outcome.APPLIED?"APPLIED":outcome==SetupCredentialProvider.Outcome.POLICY_REJECTED?"REJECTED":"UNKNOWN";
        if(intent.text("state").equals(state)){return;}
        store.jdbc.update("UPDATE setup_intent SET state=?,updated_at=? WHERE id=?",state,time(store.now()),intent.id("id"));
        if(state.equals("REJECTED")){release(intent.id("id"));}
        audit.setup(invitation.id("sender_id"),intent.id("id"),"SETUP_"+(state.equals("UNKNOWN")?"UNCERTAIN":state),"Managed setup outcome recorded");
    });}
    private Result finish(Prepared p,String token,String proof){Row invitation=store.lock(p.invitation().id("id"));Row intent=intent(p.intent().id("id"));
        if(intent.text("state").equals("COMPLETED")){proof(invitation,proof,true);authorizeReplay(invitation,intent);return result(invitation,intent,true);}
        if(!intent.text("state").equals("APPLIED")){throw fail(SetupFailure.Reason.REQUEST_IN_PROGRESS);}
        var sender=store.jdbc.queryForMap("SELECT state,email_verified,credential_operation_pending FROM account_identity WHERE id=?",invitation.id("sender_id"));
        boolean invalid=!invitation.text("state").equals("PENDING")||!store.now().isBefore(invitation.instant("expires_at"))||!store.issuerEligible(invitation)||!sender.get("state").equals("ACTIVE")||!Boolean.TRUE.equals(sender.get("email_verified"))||invitation.number("generation")!=intent.number("generation");
        if(invalid){store.jdbc.update("UPDATE setup_intent SET state='BLOCKED',updated_at=? WHERE id=?",time(store.now()),intent.id("id"));audit.setup(invitation.id("sender_id"),intent.id("id"),"SETUP_BLOCKED","Provider applied setup but current invitation authority prevents activation");return null;}
        if(Boolean.TRUE.equals(sender.get("credential_operation_pending"))){throw fail(SetupFailure.Reason.REQUEST_IN_PROGRESS);}
        Row current=store.token(token);if(!current.id("id").equals(invitation.id("id"))){throw fail(SetupFailure.Reason.TOKEN_INVALID);}use(proof(invitation,proof,false));
        Values v=json.readValue(intent.text("payload"),Values.class);guards(invitation,v);
        // Recheck deadline after waiting on address/registration guards.
        if(!store.now().isBefore(invitation.instant("expires_at"))){throw fail(SetupFailure.Reason.TOKEN_INVALID);}proof(invitation,proof,false);
        if(store.buyerSetup(invitation)){trading.requireCapacity(invitation.id("organization_id"));store.requirePending(invitation);proof(invitation,proof,false);}
        var now=store.now();UUID account=intent.id("account_id"),org=intent.id("organization_id");var a=v.address();
        store.jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state,created_at,updated_at) VALUES (?,'BUSINESS',?,true,?,'ACTIVE',?,?)",account,invitation.text("recipient_email"),v.ownerDisplayName(),time(now),time(now));
        if(!store.member(invitation)){
        store.jdbc.update("""
                INSERT INTO organization(id,owner_account_id,type,country,currency,display_name,legal_name,registration_identifier,tax_identifier,address_line1,address_line2,address_city,address_postal_code,address_country,address_latitude,address_longitude,default_language,state,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?)
                """,org,account,invitation.text("type"),invitation.text("country"),invitation.text("country").equals("RS")?"RSD":"BAM",v.displayName(),v.legalName(),v.registrationIdentifier(),v.taxIdentifier(),a.line1(),a.line2(),a.city(),a.postalCode(),a.country().name(),a.latitude(),a.longitude(),v.defaultLanguage(),time(now),time(now));
        }
        store.jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,?)",account,org,store.member(invitation)?invitation.text("invited_role"):"OWNER");
        store.jdbc.update("INSERT INTO managed_password_identity(account_id,tenant_id,provider_user_id,password_usable) VALUES (?,?,?,true)",account,intent.id("tenant_id"),intent.id("provider_user_id"));
        if(invitation.id("plan_revision_id")!=null){store.jdbc.update("INSERT INTO organization_plan(organization_id,plan_revision_id) VALUES (?,?)",org,invitation.id("plan_revision_id"));}
        if(store.buyerSetup(invitation)){trading.connect(invitation.id("organization_id"),org,invitation.id("sender_id"));}
        store.jdbc.update("UPDATE setup_intent SET state='COMPLETED',completed_at=?,updated_at=? WHERE id=?",time(now),time(now),intent.id("id"));
        store.jdbc.update("UPDATE setup_invitation SET state='ACCEPTED',revision=revision+1,updated_at=? WHERE id=?",time(now),invitation.id("id"));release(intent.id("id"));
        audit.setup(invitation.id("sender_id"),store.member(invitation)?account:org,"SETUP_COMPLETED",store.member(invitation)?"Verified member activated in original organization":"Verified owner and original organization activated atomically");return result(invitation,intent(intent.id("id")),false);
    }
    private Row proof(Row invitation,String token,boolean replay){byte[] hash;try{hash=SessionSecrets.hash(token);}catch(InvalidSession ex){throw fail(SetupFailure.Reason.TOKEN_INVALID);}
        var proofs=store.jdbc.queryForList("SELECT * FROM setup_email_proof WHERE invitation_id=? AND generation=? AND token_hash=? AND state IN ('ACTIVE','USED') FOR UPDATE",invitation.id("id"),invitation.number("generation"),hash);
        if(proofs.isEmpty()){throw fail(SetupFailure.Reason.TOKEN_INVALID);}Row p=new Row(proofs.getFirst());if(!replay&&!store.now().isBefore(p.instant("expires_at"))){throw fail(SetupFailure.Reason.TOKEN_INVALID);}return p;
    }
    private void authorizeReplay(Row invitation,Row intent){
        if(!store.now().isBefore(intent.instant("completed_at").plus(7,ChronoUnit.DAYS))){throw fail(SetupFailure.Reason.REPLAY_EXPIRED);}
        if(store.jdbc.queryForObject("SELECT count(*) FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id WHERE a.id=? AND a.email=? AND a.state='ACTIVE' AND a.email_verified AND a.security_epoch=0 AND a.credential_generation=0 AND NOT a.credential_operation_pending AND o.state='ACTIVE' AND o.id=?",Integer.class,intent.id("account_id"),invitation.text("recipient_email"),intent.id("organization_id"))!=1){throw fail(SetupFailure.Reason.INVALID_STATE);}
    }
    private void use(Row p){if(p.text("state").equals("ACTIVE")){store.jdbc.update("UPDATE setup_email_proof SET state='USED' WHERE id=?",p.id("id"));}}
    private void guards(Row i,Values v){store.jdbc.query("SELECT lock_login_email(?)",r->{},i.text("recipient_email"));if(!store.member(i)){store.jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,18001))",r->{},i.text("country")+"/"+i.text("type")+"/"+normalized(v.registrationIdentifier()));}}
    private void vacate(String email){for(UUID id:store.jdbc.queryForList("SELECT e.id FROM login_email_claim c JOIN email_change e ON e.id=c.change_id JOIN account_identity a ON a.id=e.account_id WHERE c.email=? AND c.kind='RESERVED' AND e.state='PENDING' AND (e.expires_at<=? OR e.security_epoch<>a.security_epoch OR e.credential_generation<>a.credential_generation)",UUID.class,email,time(store.now()))){store.jdbc.update("UPDATE email_change SET state=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'CANCELLED' END,revision=revision+1,updated_at=? WHERE id=?",time(store.now()),time(store.now()),id);store.jdbc.update("DELETE FROM login_email_claim WHERE email=? AND change_id=? AND kind='RESERVED'",email,id);}}
    private void release(UUID id){store.jdbc.update("DELETE FROM setup_email_claim WHERE intent_id=?",id);store.jdbc.update("DELETE FROM setup_registration_claim WHERE intent_id=?",id);}
    private Row intent(UUID id){return new Row(store.jdbc.queryForMap("SELECT * FROM setup_intent WHERE id=? FOR UPDATE",id));}
    private OrganizationRecord projection(Row invitation,Row intent){Values v=json.readValue(intent.text("payload"),Values.class);Instant at=intent.instant("completed_at");Country country=Country.valueOf(invitation.text("country"));return new OrganizationRecord(intent.id("organization_id"),1,v.displayName(),v.legalName(),OrganizationType.valueOf(invitation.text("type")),country,country==Country.RS?"RSD":"BAM",v.registrationIdentifier(),v.taxIdentifier(),v.address(),v.defaultLanguage(),"ACTIVE",false,null,intent.id("account_id"),at,at);}
    private static String normalized(String value){return value.toLowerCase(Locale.ROOT);}
    private static byte[] hash(String value){try{return MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(java.security.GeneralSecurityException ex){throw new IllegalStateException("Hashing unavailable.");}}
    public record Values(String ownerDisplayName,String displayName,String legalName,String registrationIdentifier,String taxIdentifier,OrganizationRecord.Address address,String defaultLanguage){}
    private record Prepared(Row invitation,Row intent,boolean replay,boolean dispatch){}
    private Result result(Row invitation,Row intent,boolean replay){
        if(!store.member(invitation)){return new Result(projection(invitation,intent),null,replay);}
        Values v=json.readValue(intent.text("payload"),Values.class);return new Result(null,new MemberCompletion(intent.id("account_id"),intent.id("organization_id"),invitation.text("recipient_email"),v.ownerDisplayName(),invitation.text("invited_role"),intent.instant("completed_at")),replay);
    }
    public record MemberCompletion(UUID id,UUID organizationId,String email,String displayName,String role,Instant createdAt){}
    public record Result(OrganizationRecord organization,MemberCompletion member,boolean replay){}
}
