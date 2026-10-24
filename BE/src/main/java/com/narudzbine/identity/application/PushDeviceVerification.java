package com.narudzbine.identity.application;

import com.narudzbine.identity.api.DeviceVerification;
import com.narudzbine.notifications.api.ProviderDelivery;
import com.narudzbine.organizations.api.MembershipAccess;
import com.narudzbine.shared.api.UuidGenerator;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Private FCM nonce round-trip. Only a received nonce authorizes a device registration. */
public final class PushDeviceVerification implements DeviceVerification {
    private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;private final MembershipAccess members;private final ProviderDelivery.Push push;private final TransactionTemplate tx;
    public PushDeviceVerification(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,MembershipAccess members,ProviderDelivery.Push push,PlatformTransactionManager manager) {
        this.jdbc=jdbc;this.clock=clock;this.ids=ids;this.members=members;this.push=push;tx=new TransactionTemplate(manager);tx.setTimeout(10);
    }
    public Proof verify(Request request){throw new DeviceService.Failure("DEVICE_VERIFICATION_INVALID");}
    public Outcome verifyOrChallenge(Request request,UUID verificationId,String code) {
        LoginThrottle.requireNoTransaction();
        if(verificationId!=null)return tx.execute(s->{guard(request);var rows=jdbc.queryForList("SELECT * FROM device_verification WHERE id=? AND account_id=? AND session_id=?",verificationId,request.accountId(),request.sessionId());
            if(rows.isEmpty())throw invalid();var v=rows.getFirst();
            if(!request.installationId().equals(v.get("installation_id"))||!request.platform().equals(v.get("platform"))||!DeviceService.hash(request.token()).equals(v.get("token_hash"))
                    ||!push.environment().equals(v.get("environment"))||!push.projectId().equals(v.get("project_id"))||!now().isBefore(((Timestamp)v.get("expires_at")).toInstant())||"REJECTED".equals(v.get("state"))
                    ||v.get("code_hash")==null||code==null||!MessageDigest.isEqual(DeviceService.hash(code).getBytes(java.nio.charset.StandardCharsets.US_ASCII),((String)v.get("code_hash")).getBytes(java.nio.charset.StandardCharsets.US_ASCII)))throw invalid();
            return new Outcome(new Proof(request.accountId(),request.sessionId(),request.installationId(),request.platform(),DeviceService.hash(request.token()),push.environment(),push.projectId(),now(),verificationId),null);
        });
        String nonce=SessionSecrets.generate();var start=tx.execute(s->{guard(request);Instant at=now();var old=jdbc.queryForList("SELECT id,expires_at,state FROM device_verification WHERE account_id=? AND session_id=? AND installation_id=? AND platform=? AND token_hash=? AND environment=? AND project_id=? AND expires_at>? ORDER BY created_at DESC,id LIMIT 1",request.accountId(),request.sessionId(),request.installationId(),request.platform(),DeviceService.hash(request.token()),push.environment(),push.projectId(),time(at));
            if(!old.isEmpty()){var row=old.getFirst();if("REJECTED".equals(row.get("state")))throw new DeviceService.Failure("SERVICE_UNAVAILABLE");return new Start((UUID)row.get("id"),((Timestamp)row.get("expires_at")).toInstant(),false);}
            if(jdbc.queryForObject("SELECT count(*) FROM device_verification WHERE account_id=? AND expires_at>? AND state IN('SENDING','ACCEPTED','UNKNOWN')",Integer.class,request.accountId(),time(at))>=3)throw new DeviceService.Failure("DEVICE_LIMIT_REACHED");
            UUID id=ids.next();Instant expires=at.plusSeconds(120);jdbc.update("INSERT INTO device_verification(id,account_id,session_id,installation_id,platform,token_hash,code_hash,environment,project_id,created_at,expires_at,state) VALUES (?,?,?,?,?,?,?,?,?,?,?,'SENDING')",id,request.accountId(),request.sessionId(),request.installationId(),request.platform(),DeviceService.hash(request.token()),DeviceService.hash(nonce),push.environment(),push.projectId(),time(at),time(expires));return new Start(id,expires,true);
        });
        if(start.send()){
            ProviderDelivery.Result result;try{result=push.send(request.token(),Map.of("kind","DEVICE_VERIFICATION","verificationId",start.id().toString(),"verificationCode",nonce));}catch(RuntimeException unknown){result=ProviderDelivery.Result.of(ProviderDelivery.Status.UNKNOWN);}
            String state=switch(result.status()){case ACCEPTED->"ACCEPTED";case INVALID_TOKEN,REJECTED->"REJECTED";default->"UNKNOWN";};
            tx.executeWithoutResult(s->jdbc.update("UPDATE device_verification SET state=? WHERE id=? AND state='SENDING'",state,start.id()));
            if(state.equals("REJECTED"))throw new DeviceService.Failure("SERVICE_UNAVAILABLE");
        }
        return new Outcome(null,new Challenge(start.id(),start.expires()));
    }
    private void guard(Request r) {
        members.lockForOrganizationWrite(r.accountId());jdbc.queryForObject("SELECT id FROM account_identity WHERE id=? FOR UPDATE",UUID.class,r.accountId());
        int valid=jdbc.queryForObject("""
            SELECT count(*) FROM application_session s JOIN account_identity a ON a.id=s.account_id LEFT JOIN business_account b ON b.id=a.id LEFT JOIN organization o ON o.id=b.organization_id
            WHERE s.id=? AND a.id=? AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending AND s.revoked_at IS NULL
            AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation AND s.absolute_expires_at>?
            AND s.last_qualified_activity_at+CASE WHEN a.kind='PLATFORM_ADMIN' THEN interval '30 minutes' ELSE interval '168 hours' END>?
            AND (a.kind='PLATFORM_ADMIN' OR o.state='ACTIVE') AND ((s.auth_method_type='PASSWORD' AND NOT EXISTS(SELECT 1 FROM managed_password_identity p WHERE p.account_id=a.id AND NOT p.password_usable)) OR (s.auth_method_type='EXTERNAL' AND EXISTS(SELECT 1 FROM external_identity e WHERE e.id=s.auth_method_id AND e.account_id=a.id AND e.active)))
            """,Integer.class,r.sessionId(),r.accountId(),time(now()),time(now()));
        if(valid!=1)throw new com.narudzbine.identity.api.InvalidSession();
    }
    private DeviceService.Failure invalid(){return new DeviceService.Failure("DEVICE_VERIFICATION_INVALID");}
    private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}private static Timestamp time(Instant at){return Timestamp.from(at);}
    private record Start(UUID id,Instant expires,boolean send){}
}
