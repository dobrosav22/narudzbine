package com.narudzbine.identity.application;

import com.narudzbine.notifications.api.ProviderDelivery;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Current parent eligibility and purpose decryption; caller already holds all source organization/account guards. */
@Transactional(propagation=Propagation.MANDATORY)
public class TechnicalEmailResolver implements ProviderDelivery.TechnicalEmails {
    private final JdbcTemplate jdbc;private final Clock clock;private final ResetDeliveryCipher resets;private final EmailDeliveryCipher emails;
    private final ObjectProvider<SetupInvitationStore> setup;private final ObjectProvider<RecoveryDeliveryCipher> recovery;private final String base;
    public TechnicalEmailResolver(JdbcTemplate jdbc,Clock clock,ResetDeliveryCipher resets,EmailDeliveryCipher emails,ObjectProvider<SetupInvitationStore> setup,ObjectProvider<RecoveryDeliveryCipher> recovery,String base) {
        this.jdbc=jdbc;this.clock=clock;this.resets=resets;this.emails=emails;this.setup=setup;this.recovery=recovery;
        URI uri=URI.create(base);if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null)throw new IllegalArgumentException("Explicit HTTPS client base required");this.base=base.replaceAll("/+$","");
    }
    public ProviderDelivery.Technical resolve(String kind,UUID source) {
        return switch(kind){case "SETUP"->setup(source);case "RESET"->reset(source);case "EMAIL_PROOF"->email(source);case "RECOVERY"->recovery(source);default->throw new IllegalArgumentException("Unknown technical source");};
    }
    private ProviderDelivery.Technical reset(UUID source) {
        var row=jdbc.queryForMap("SELECT p.*,d.encrypted_token,d.locale,a.state AS account_state,a.email AS current_email,a.security_epoch AS current_epoch,a.credential_generation AS current_generation,a.email_verified,o.state AS organization_state FROM password_reset_delivery d JOIN password_reset_proof p ON p.id=d.proof_id JOIN account_identity a ON a.id=p.account_id LEFT JOIN business_account b ON b.id=a.id LEFT JOIN organization o ON o.id=b.organization_id WHERE d.proof_id=?",source);
        if(row.get("encrypted_token")==null||!"ACTIVE".equals(row.get("state"))||!active(row)||!row.get("email").equals(row.get("current_email"))||!row.get("security_epoch").equals(row.get("current_epoch"))||!row.get("credential_generation").equals(row.get("current_generation"))||expired(row))return null;
        return message((String)row.get("email"),(String)row.get("locale"),"PASSWORD_RESET","password-reset",resets.decrypt(source,(byte[])row.get("encrypted_token")),instant(row,"expires_at"));
    }
    private ProviderDelivery.Technical email(UUID source) {
        var row=jdbc.queryForMap("SELECT e.*,p.side,p.verified_at,d.encrypted_token,d.locale,a.state AS account_state,a.email AS current_email,a.security_epoch AS current_epoch,a.credential_generation AS current_generation,a.email_verified,o.state AS organization_state FROM email_change_delivery d JOIN email_change_proof p ON p.id=d.proof_id JOIN email_change e ON e.id=p.change_id JOIN account_identity a ON a.id=e.account_id LEFT JOIN business_account b ON b.id=a.id LEFT JOIN organization o ON o.id=b.organization_id WHERE d.proof_id=?",source);
        if(row.get("encrypted_token")==null||!"PENDING".equals(row.get("state"))||row.get("verified_at")!=null||!active(row)||!row.get("old_email").equals(row.get("current_email"))||!row.get("security_epoch").equals(row.get("current_epoch"))||!row.get("credential_generation").equals(row.get("current_generation"))||expired(row))return null;
        return message((String)row.get("OLD".equals(row.get("side"))?"old_email":"new_email"),(String)row.get("locale"),"EMAIL_PROOF","email-proof",emails.decrypt(source,(byte[])row.get("encrypted_token")),instant(row,"expires_at"));
    }
    private ProviderDelivery.Technical setup(UUID source) {
        var store=setup.getIfAvailable();if(store==null)throw new IllegalStateException("Setup delivery configuration unavailable");
        var d=jdbc.queryForMap("SELECT * FROM setup_delivery WHERE id=?",source);if(d.get("encrypted_token")==null)return null;var invitation=store.read((UUID)d.get("invitation_id"));
        if(!d.get("generation").equals(invitation.values().get("generation"))||!d.get("recipient_email").equals(invitation.text("recipient_email"))||!store.pending(invitation))return null;
        UUID proof=(UUID)d.get("proof_id");Instant expiry=invitation.instant("expires_at");
        if(proof!=null){var p=jdbc.queryForMap("SELECT * FROM setup_email_proof WHERE id=?",proof);if(!"ACTIVE".equals(p.get("state"))||!d.get("generation").equals(p.get("generation"))||!clock.instant().isBefore(instant(p,"expires_at")))return null;expiry=instant(p,"expires_at");}
        String token=store.cipher.decrypt(source,(byte[])d.get("encrypted_token"),proof!=null);
        return message((String)d.get("recipient_email"),(String)d.get("locale"),proof==null?"INVITATION":"INVITATION_PROOF",proof==null?"invitation":"invitation-proof",token,expiry);
    }
    private ProviderDelivery.Technical recovery(UUID source) {
        var d=jdbc.queryForMap("SELECT * FROM recovery_delivery WHERE id=?",source);var c=jdbc.queryForMap("SELECT * FROM recovery_case WHERE id=?",d.get("case_id"));
        if(!Set.of("EVIDENCE_REVIEW","NOTICE_PERIOD").contains(c.get("state"))||expired(c)||jdbc.queryForObject("SELECT count(*) FROM organization WHERE id=? AND state='ACTIVE'",Integer.class,c.get("organization_id"))!=1)return null;
        for(String prefix:List.of("creator","target","owner")){
            Object account=c.get(prefix.equals("owner")?"former_owner_id":prefix+"_id");var a=jdbc.queryForMap("SELECT * FROM account_identity WHERE id=?",account);
            if(!prefix.equals("owner")&&(!"ACTIVE".equals(a.get("state"))||!Boolean.TRUE.equals(a.get("email_verified")))||!a.get("security_epoch").equals(c.get(prefix+"_epoch"))||(!prefix.equals("creator")&&!a.get("credential_generation").equals(c.get(prefix+"_generation"))))return null;
        }
        if("NOTICE".equals(d.get("kind")))return new ProviderDelivery.Technical((String)d.get("destination_email"),(String)d.get("locale"),"RECOVERY_NOTICE",base+"/#/recovery/"+c.get("id"),0);
        if(d.get("encrypted_token")==null||!"NOTICE_PERIOD".equals(c.get("state"))||c.get("consumed_at")!=null)return null;
        var reviewer=jdbc.queryForMap("SELECT * FROM account_identity WHERE id=?",c.get("reviewer_id"));if(!"ACTIVE".equals(reviewer.get("state"))||!Boolean.TRUE.equals(reviewer.get("email_verified"))||!reviewer.get("security_epoch").equals(c.get("reviewer_epoch")))return null;
        var cipher=recovery.getIfAvailable();if(cipher==null)throw new IllegalStateException("Recovery delivery configuration unavailable");
        return message((String)d.get("destination_email"),(String)d.get("locale"),"RECOVERY_ACCEPTANCE","recovery-acceptance",cipher.decrypt(source,(byte[])d.get("encrypted_token")),instant(c,"expires_at"));
    }
    private boolean active(Map<String,Object> row){return "ACTIVE".equals(row.get("account_state"))&&Boolean.TRUE.equals(row.get("email_verified"))&&(row.get("organization_state")==null||"ACTIVE".equals(row.get("organization_state")));}
    private boolean expired(Map<String,Object> row){return !clock.instant().isBefore(instant(row,"expires_at"));}
    private static Instant instant(Map<String,Object> row,String key){return ((Timestamp)row.get(key)).toInstant();}
    private ProviderDelivery.Technical message(String to,String locale,String event,String path,String token,Instant expiry){return new ProviderDelivery.Technical(to,locale,event,base+"/#/"+path+"?token="+URLEncoder.encode(token,StandardCharsets.UTF_8),Math.max(1,Duration.between(clock.instant(),expiry).toMinutes()));}
}
