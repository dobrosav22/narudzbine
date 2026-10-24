package com.narudzbine.identity.application;

import com.narudzbine.identity.api.AuthenticatedSession;
import com.narudzbine.identity.api.DeviceVerification;
import com.narudzbine.shared.api.UuidGenerator;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Transactional(propagation = Propagation.MANDATORY)
public class DeviceService implements com.narudzbine.notifications.api.ProviderDelivery.Devices {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final UuidGenerator ids;
    private final String environment;
    private final String project;
    private final ResetDeliveryCipher cipher;
    private final com.narudzbine.audit.api.DeviceAudit audit;

    public DeviceService(JdbcTemplate jdbc, Clock clock, UuidGenerator ids, String environment, String project, byte[] key,com.narudzbine.audit.api.DeviceAudit audit) {
        this.jdbc=jdbc;this.clock=clock;this.ids=ids;this.environment=environment;this.project=project;
        this.cipher=key==null?null:new ResetDeliveryCipher(key,"push-device/v1");
        this.audit=audit;
        if (!environment.matches("[a-z][a-z0-9-]{0,39}") || !project.matches("[A-Za-z0-9._-]{1,100}")) {
            throw new IllegalArgumentException("Invalid device environment/project configuration");
        }
    }

    public Item register(AuthenticatedSession actor, UUID installation, String platform, String token, DeviceVerification.Proof proof) {
        Instant now=now();String hash=hash(token);
        if (cipher==null || environment.equals("unconfigured") || project.equals("unconfigured") || proof==null
                || !actor.accountId().equals(proof.accountId()) || !actor.sessionId().equals(proof.sessionId())
                || !installation.equals(proof.installationId()) || !platform.equals(proof.platform())
                || !hash.equals(proof.tokenSha256()) || !environment.equals(proof.environment()) || !project.equals(proof.projectId())
                || proof.verifiedAt()==null || proof.verifiedAt().isAfter(now) || !now.isBefore(proof.verifiedAt().plusSeconds(60))) {
            throw new Failure("SERVICE_UNAVAILABLE");
        }
        var binding=jdbc.queryForMap("SELECT * FROM device_registry_guard WHERE id=1 FOR UPDATE");
        if (binding.get("environment")!=null && (!environment.equals(binding.get("environment")) || !project.equals(binding.get("project_id")))) {
            throw new Failure("SERVICE_UNAVAILABLE");
        }
        var existing=jdbc.queryForList("SELECT * FROM push_device WHERE environment=? AND installation_id=?",environment,installation);
        if (!existing.isEmpty() && (!actor.accountId().equals(existing.getFirst().get("account_id")) || !platform.equals(existing.getFirst().get("platform")))) {
            throw new Failure("DEVICE_CONFLICT");
        }
        java.util.Map<String,Object> verification=null;
        if(proof.verificationId()!=null){
            var rows=jdbc.queryForList("SELECT * FROM device_verification WHERE id=? AND account_id=? AND session_id=? FOR UPDATE",proof.verificationId(),actor.accountId(),actor.sessionId());
            if(rows.isEmpty())throw new Failure("DEVICE_VERIFICATION_INVALID");verification=rows.getFirst();
            if(!installation.equals(verification.get("installation_id"))||!platform.equals(verification.get("platform"))||!hash.equals(verification.get("token_hash"))||!environment.equals(verification.get("environment"))||!project.equals(verification.get("project_id"))||!now.isBefore(((Timestamp)verification.get("expires_at")).toInstant())||"REJECTED".equals(verification.get("state")))throw new Failure("DEVICE_VERIFICATION_INVALID");
            if("CONSUMED".equals(verification.get("state"))&&(existing.isEmpty()||!existing.getFirst().get("id").equals(verification.get("device_id"))||!existing.getFirst().get("revision").equals(verification.get("device_revision"))||!Boolean.TRUE.equals(existing.getFirst().get("enabled"))))throw new Failure("DEVICE_VERIFICATION_INVALID");
        }
        var claims=jdbc.queryForList("SELECT account_id FROM push_token_claim WHERE environment=? AND token_hash=?",UUID.class,environment,hash);
        if (!claims.isEmpty() && !actor.accountId().equals(claims.getFirst())) { throw new Failure("DEVICE_CONFLICT"); }
        // A token cannot silently move to another installation, even of the same user.
        var tokens=jdbc.queryForList("SELECT installation_id FROM push_device WHERE environment=? AND token_hash=? AND enabled",UUID.class,environment,hash);
        if (!tokens.isEmpty() && !installation.equals(tokens.getFirst())) { throw new Failure("DEVICE_CONFLICT"); }
        UUID id=existing.isEmpty()?ids.next():(UUID)existing.getFirst().get("id");
        int count=eligibleCount(actor.accountId(),now,id);
        if (count >= (actor.platformAdministrator()?3:10)) { throw new Failure("DEVICE_LIMIT_REACHED"); }
        if (binding.get("environment")==null) { jdbc.update("UPDATE device_registry_guard SET environment=?,project_id=? WHERE id=1",environment,project); }
        jdbc.update("INSERT INTO push_token_claim(environment,token_hash,account_id) VALUES (?,?,?) ON CONFLICT DO NOTHING",environment,hash,actor.accountId());
        if (existing.isEmpty()) {
            jdbc.update("INSERT INTO push_device(id,environment,installation_id,account_id,session_id,platform,token_hash,token_envelope,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                    id,environment,installation,actor.accountId(),actor.sessionId(),platform,hash,cipher.encrypt(id,token),time(now));
            audit.deviceChanged(actor.accountId(),id,com.narudzbine.audit.api.DeviceAudit.Action.DEVICE_REGISTERED);
        } else {
            var old=existing.getFirst();
            if (!actor.sessionId().equals(old.get("session_id")) || !hash.equals(old.get("token_hash")) || !Boolean.TRUE.equals(old.get("enabled"))) {
                jdbc.update("UPDATE push_device SET session_id=?,token_hash=?,token_envelope=?,enabled=true,disabled_at=NULL,revision=revision+1 WHERE id=?",
                        actor.sessionId(),hash,cipher.encrypt(id,token),id);
                audit.deviceChanged(actor.accountId(),id,com.narudzbine.audit.api.DeviceAudit.Action.DEVICE_REPLACED);
            }
        }
        var result=item(id,now);
        if(verification!=null&&!"CONSUMED".equals(verification.get("state")))jdbc.update("UPDATE device_verification SET state='CONSUMED',device_id=?,device_revision=? WHERE id=?",id,result.revision(),proof.verificationId());
        return result;
    }

    public com.narudzbine.notifications.api.ProviderDelivery.Devices.Address address(UUID account,UUID device){
        if(cipher==null)throw new Failure("SERVICE_UNAVAILABLE");Instant at=now();var rows=jdbc.queryForList("SELECT * FROM push_device_eligibility WHERE id=? AND account_id=? AND environment=? AND eligible AND absolute_expires_at>? AND idle_expires_at>?",device,account,environment,time(at),time(at));if(rows.isEmpty())return null;var row=rows.getFirst();return new com.narudzbine.notifications.api.ProviderDelivery.Devices.Address(device,((Number)row.get("revision")).longValue(),(String)row.get("token_hash"),cipher.decrypt(device,(byte[])row.get("token_envelope")));
    }
    public void invalid(UUID account,UUID device,long revision,String hash){jdbc.update("UPDATE push_device SET enabled=false,token_envelope=NULL,disabled_at=?,revision=revision+1 WHERE id=? AND account_id=? AND environment=? AND revision=? AND token_hash=? AND enabled",time(now()),device,account,environment,revision,hash);}

    public Page list(UUID account, int page, int size, boolean total) {
        Instant now=now();
        var items=jdbc.query("SELECT id FROM push_device WHERE account_id=? AND environment=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (r,n)->item(r.getObject(1,UUID.class),now),account,environment,size,(long)page*size);
        Long count=total?jdbc.queryForObject("SELECT count(*) FROM push_device WHERE account_id=? AND environment=?",Long.class,account,environment):null;
        return new Page(items,page,size,count);
    }

    public void remove(UUID account,UUID id) {
        var own=jdbc.queryForList("SELECT id FROM push_device WHERE id=? AND account_id=? AND environment=?",UUID.class,id,account,environment);
        if (own.isEmpty()) { throw new Failure("NOT_FOUND"); }
        int changed=jdbc.update("UPDATE push_device SET enabled=false,token_envelope=NULL,disabled_at=?,revision=revision+1 WHERE id=? AND enabled",time(now()),id);
        if(changed==1) { audit.deviceChanged(account,id,com.narudzbine.audit.api.DeviceAudit.Action.DEVICE_REMOVED); }
    }

    public int cleanup() {
        Instant now=now();
        return jdbc.update("""
                WITH expired AS (
                  SELECT d.id FROM push_device d JOIN push_device_eligibility e ON e.id=d.id
                  WHERE d.environment=? AND d.enabled AND (NOT e.eligible OR e.absolute_expires_at<=? OR e.idle_expires_at<=?)
                  ORDER BY d.created_at,d.id LIMIT 100 FOR UPDATE OF d SKIP LOCKED
                ) UPDATE push_device d SET enabled=false,token_envelope=NULL,disabled_at=?,revision=revision+1
                  FROM expired e WHERE d.id=e.id
                """,environment,time(now),time(now),time(now));
    }

    private int eligibleCount(UUID account,Instant now,UUID excluding) {
        return jdbc.queryForObject("SELECT count(*) FROM push_device_eligibility WHERE account_id=? AND environment=? AND id<>? AND eligible AND absolute_expires_at>? AND idle_expires_at>?",
                Integer.class,account,environment,excluding,time(now),time(now));
    }
    private Item item(UUID id,Instant now) {
        return jdbc.queryForObject("SELECT * FROM push_device_eligibility WHERE id=?",(r,n)->new Item(id,r.getLong("revision"),r.getObject("installation_id",UUID.class),r.getString("platform"),
                r.getBoolean("eligible")&&now.isBefore(r.getTimestamp("absolute_expires_at").toInstant())&&now.isBefore(r.getTimestamp("idle_expires_at").toInstant()),r.getTimestamp("created_at").toInstant()),id);
    }
    public static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII))); }
        catch(NoSuchAlgorithmException e) { throw new IllegalStateException("Device digest unavailable"); }
    }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
    private static Timestamp time(Instant at) { return Timestamp.from(at); }
    public record Item(UUID id,long revision,UUID installationId,String platform,boolean enabled,Instant createdAt) {}
    public record Page(List<Item> items,int page,int size,Long total) {}
    public static final class Failure extends RuntimeException {
        private final String code;
        public Failure(String code) { super("Device request could not be completed");this.code=code; }
        public String code() { return code; }
    }
}
