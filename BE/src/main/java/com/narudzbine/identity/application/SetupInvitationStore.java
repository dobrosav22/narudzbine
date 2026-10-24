package com.narudzbine.identity.application;

import com.narudzbine.identity.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;

public final class SetupInvitationStore {
    final JdbcTemplate jdbc;
    final Clock clock;
    final UuidGenerator ids;
    final ResourceRevisions revisions;
    final ResourceRevisions legacyRevisions;
    final SetupDeliveryCipher cipher;
    public SetupInvitationStore(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,ResourceRevisions revisions,SetupDeliveryCipher cipher,ResourceRevisions legacyRevisions){this.jdbc=jdbc;this.clock=clock;this.ids=ids;this.revisions=revisions;this.cipher=cipher;this.legacyRevisions=legacyRevisions;}
    Row read(UUID id){var rows=jdbc.queryForList("SELECT * FROM setup_invitation WHERE id=?",id);if(rows.isEmpty()){throw fail(SetupFailure.Reason.NOT_FOUND);}return new Row(rows.getFirst());}
    Row token(String token){byte[] hash;try{hash=SessionSecrets.hash(token);}catch(InvalidSession ex){throw fail(SetupFailure.Reason.TOKEN_INVALID);}var rows=jdbc.queryForList("SELECT * FROM setup_invitation WHERE token_hash=?",hash);if(rows.isEmpty()){throw fail(SetupFailure.Reason.TOKEN_INVALID);}return new Row(rows.getFirst());}
    Row lock(UUID id){Row prior=read(id);if(businessOrigin(prior)){jdbc.queryForList("SELECT id FROM organization WHERE id IN (?,?) ORDER BY id FOR UPDATE",UUID.class,prior.id("organization_id"),prior.id("buyer_id"));}jdbc.queryForList("SELECT id FROM account_identity WHERE id=? FOR UPDATE",UUID.class,prior.id("sender_id"));return new Row(jdbc.queryForMap("SELECT * FROM setup_invitation WHERE id=? FOR UPDATE",id));}
    boolean trading(Row i){return "TRADING".equals(i.text("purpose"));}
    boolean buyerSetup(Row i){return "BUYER_SETUP".equals(i.text("purpose"));}
    boolean businessOrigin(Row i){return !"ORGANIZATION".equals(i.text("purpose"));}
    boolean member(Row i){return "MEMBER".equals(i.text("purpose"));}
    boolean issuerEligible(Row i){
        if(!businessOrigin(i)){return jdbc.queryForObject("SELECT count(*) FROM account_identity WHERE id=? AND kind='PLATFORM_ADMIN' AND state='ACTIVE' AND email_verified",Integer.class,i.id("sender_id"))==1;}
        if(!member(i)){return jdbc.queryForObject("SELECT count(*) FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id WHERE a.id=? AND a.state='ACTIVE' AND a.email_verified AND b.organization_id=? AND o.state='ACTIVE' AND o.type='VENDOR' AND b.role IN ('OWNER','ADMIN')",Integer.class,i.id("sender_id"),i.id("organization_id"))==1&&(!trading(i)||jdbc.queryForObject("SELECT count(*) FROM organization WHERE id=? AND state='ACTIVE' AND type='BUYER' AND country=?",Integer.class,i.id("buyer_id"),i.text("country"))==1);}
        return jdbc.queryForObject("SELECT count(*) FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id WHERE a.id=? AND a.state='ACTIVE' AND a.email_verified AND b.organization_id=? AND o.state='ACTIVE' AND (b.role='OWNER' OR (b.role='ADMIN' AND ?='STAFF'))",Integer.class,i.id("sender_id"),i.id("organization_id"),i.text("invited_role"))==1;
    }
    boolean senderActive(Row i){return issuerEligible(i)&&!jdbc.queryForObject("SELECT credential_operation_pending FROM account_identity WHERE id=?",Boolean.class,i.id("sender_id"));}
    boolean pending(Row i){return i.text("state").equals("PENDING")&&now().isBefore(i.instant("expires_at"))&&senderActive(i);}
    void requirePending(Row i){if(!pending(i)){throw fail(SetupFailure.Reason.TOKEN_INVALID);}}
    boolean busy(Row i){return jdbc.queryForObject("SELECT count(*) FROM setup_intent WHERE invitation_id=? AND state NOT IN ('REJECTED','COMPLETED')",Integer.class,i.id("id"))>0;}
    void deliver(Row i,String token,UUID proof){UUID delivery=ids.next();jdbc.update("INSERT INTO setup_delivery(id,invitation_id,generation,proof_id,encrypted_token,recipient_email,locale,state,created_at) VALUES (?,?,?,?,?,?,?,'QUEUED',?)",delivery,i.id("id"),i.number("generation"),proof,cipher.encrypt(delivery,token,proof!=null),i.text("recipient_email"),trading(i)?tradingLocale(i):member(i)?jdbc.queryForObject("SELECT default_language FROM organization WHERE id=?",String.class,i.id("organization_id")):i.text("country").equals("RS")?"sr-Latn-RS":"bs-Latn-BA",time(now()));}
    private String tradingLocale(Row i){return jdbc.queryForObject("SELECT coalesce((SELECT a.language_override FROM account_identity a JOIN business_account b ON b.id=a.id WHERE a.email=? AND a.email_verified AND b.organization_id=o.id),o.default_language) FROM organization o WHERE o.id=?",String.class,i.text("recipient_email"),i.id("buyer_id"));}
    void invalidateProofs(UUID invitation){jdbc.update("UPDATE setup_email_proof SET state='INVALIDATED' WHERE invitation_id=? AND state IN ('ACTIVE','USED')",invitation);}
    Invitation view(Row i){String state=i.values().containsKey("effective_state")?i.text("effective_state"):i.text("state");if(!i.values().containsKey("effective_state")&&state.equals("PENDING")&&!now().isBefore(i.instant("expires_at"))){state="EXPIRED";}
        UUID org=trading(i)?i.id("buyer_id"):member(i)?i.id("organization_id"):jdbc.queryForList("SELECT organization_id FROM setup_intent WHERE invitation_id=? AND state='COMPLETED'",UUID.class,i.id("id")).stream().findFirst().orElse(null);
        return new Invitation(i.id("id"),revision(i),trading(i)?"TRADING":member(i)?"MEMBER":"SETUP_"+i.text("type"),i.text("recipient_email"),member(i)?i.id("organization_id"):org,state,deliveryState(i),i.instant("expires_at"),i.instant("created_at"),i.instant("updated_at"));}
    private String deliveryState(Row i){
        String state=jdbc.queryForObject("SELECT COALESCE((SELECT j.state FROM setup_delivery d LEFT JOIN external_job j ON j.source_kind='SETUP' AND j.source_id=d.id WHERE d.invitation_id=? AND d.generation=? AND d.proof_id IS NULL ORDER BY d.created_at DESC,d.id LIMIT 1),'QUEUED')",String.class,i.id("id"),i.number("generation"));
        return Set.of("SUPPRESSED","EXPIRED").contains(state)?"FAILED":state;
    }
    String revision(Row i){return revisions.encode("invitation/v1",i.id("id"),i.number("revision"));}
    void requireRevision(Row i,String expected){if(!revision(i).equals(expected)){throw new RevisionConflict(revision(i));}}
    Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
    static Timestamp time(Instant i){return Timestamp.from(i);}
    static SetupFailure fail(SetupFailure.Reason reason){return new SetupFailure(reason);}
    record Row(Map<String,Object> values){UUID id(String k){return (UUID)values.get(k);}String text(String k){return (String)values.get(k);}long number(String k){return ((Number)values.get(k)).longValue();}Instant instant(String k){return values.get(k)==null?null:((Timestamp)values.get(k)).toInstant();}byte[] bytes(String k){return (byte[])values.get(k);}@Override public String toString(){return "SetupRow[redacted]";}}
    public record Invitation(UUID id,String revision,String purpose,String recipientEmail,UUID targetOrganizationId,String state,String deliveryState,Instant expiresAt,Instant createdAt,Instant updatedAt){}
}
