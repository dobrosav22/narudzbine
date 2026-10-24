package com.narudzbine.identity.application;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import java.nio.file.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class SessionRetentionIT {
    @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
    static final Instant NOW=Instant.parse("2026-10-21T12:00:00Z"),CUTOFF=NOW.minus(Duration.ofDays(30));
    static final UuidGenerator IDS=new UuidGenerator(Clock.fixed(NOW,ZoneOffset.UTC));
    static JdbcTemplate owner;static DriverManagerDataSource runtime;static UUID admin,business;
    SessionRetention service;TransactionTemplate tx;
    @BeforeAll static void schema()throws Exception{
        MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());owner=new JdbcTemplate(ds);admin=IDS.next();business=IDS.next();UUID org=IDS.next();
        new TransactionTemplate(new DataSourceTransactionManager(ds)).executeWithoutResult(t->{
            owner.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE'),(?,'BUSINESS',?,true,'Synthetic','ACTIVE')",admin,admin+"@example.com",business,business+"@example.com");owner.update("INSERT INTO platform_account(id) VALUES(?)",admin);
            owner.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES(?,'BUYER','BA','BAM','Synthetic','Synthetic','SYN','Synthetic','Synthetic','71000','BA','bs-Latn-BA','ACTIVE',?)",org,business);owner.update("INSERT INTO business_account(id,organization_id,role) VALUES(?,?,'OWNER')",business,org);
        });
        owner.execute("CREATE ROLE session_retention_runtime LOGIN PASSWORD 'synthetic-local-only'");owner.execute("GRANT USAGE ON SCHEMA public TO session_retention_runtime");owner.execute("GRANT SELECT ON application_session,account_identity,credential_operation,external_challenge TO session_retention_runtime");
        owner.execute(Files.readString(Path.of("retention/session-grants.sql")).replace("__RUNTIME_ROLE__","session_retention_runtime"));
        runtime=new DriverManagerDataSource(DB.getJdbcUrl(),"session_retention_runtime","synthetic-local-only");
    }
    static Timestamp at(Instant i){return Timestamp.from(i);}
    static byte[] hash(UUID id){try{return java.security.MessageDigest.getInstance("SHA-256").digest(id.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    @BeforeEach void service(){service=new SessionRetention(new JdbcTemplate(runtime),Clock.fixed(NOW,ZoneOffset.UTC));tx=new TransactionTemplate(new DataSourceTransactionManager(runtime));tx.setTimeout(10);sweep();}
    int sweep(){return tx.execute(t->service.cleanup());}
    UUID session(UUID account,Instant activity,Instant expiry,Instant revoked){UUID id=IDS.next();owner.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,revoked_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?,?,'PASSWORD',0,0)",id,account,hash(id),at(activity.minusSeconds(60)),at(activity),at(expiry),revoked==null?null:at(revoked),at(activity));return id;}
    boolean live(UUID id){return owner.queryForObject("SELECT EXISTS(SELECT 1 FROM application_session WHERE id=?)",Boolean.class,id);}
    UUID operation(UUID session,String state,Instant updated){UUID id=IDS.next();owner.update("INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,current_session_id,created_at,updated_at) VALUES(?,?,'CHANGE',?,0,0,?,?,?)",id,admin,state,session,at(CUTOFF.minusSeconds(86400)),at(updated));return id;}
    UUID challenge(UUID session,String state,Instant expires){UUID id=IDS.next();owner.update("INSERT INTO external_challenge(id,state_hash,provider,purpose,transport,return_target,browser_binding_hash,encrypted_verifier,account_id,original_session_id,original_token_hash,security_epoch,credential_generation,state,created_at,expires_at) VALUES(?,?,'GOOGLE','LINK','BROWSER','WEB',?,?,?, ?,?,0,0,?,?,?)",id,hash(id),hash(IDS.next()),new byte[71],admin,session,hash(session),state,at(expires.minusSeconds(300)),at(expires));return id;}
    UUID old(){return session(admin,CUTOFF.minusSeconds(3600),CUTOFF.minusSeconds(1),null);}
    @Test void exactThirtyDaysAbsoluteIdleAndRevocationUseCurrentAccountWindows(){
        UUID absolute=session(business,CUTOFF.minusSeconds(60),CUTOFF,null),freshAbsolute=session(business,CUTOFF.minusSeconds(60),CUTOFF.plusMillis(1),null);
        UUID idleAdmin=session(admin,CUTOFF.minusSeconds(1800),NOW,null),freshAdmin=session(admin,CUTOFF.minusSeconds(1800).plusMillis(1),NOW,null);
        UUID idleBusiness=session(business,CUTOFF.minusSeconds(168*3600),NOW,null),freshBusiness=session(business,CUTOFF.minusSeconds(168*3600).plusMillis(1),NOW,null);
        UUID revoked=session(business,CUTOFF.minusSeconds(60),NOW,CUTOFF),freshRevoked=session(business,CUTOFF.minusSeconds(60),NOW,CUTOFF.plusMillis(1));
        assertThat(sweep()).isEqualTo(4);for(UUID id:List.of(absolute,idleAdmin,idleBusiness,revoked)){assertThat(live(id)).isFalse();assertThat(owner.queryForObject("SELECT account_id FROM application_session_identity WHERE id=?",UUID.class,id)).isIn(admin,business);}for(UUID id:List.of(freshAbsolute,freshAdmin,freshBusiness,freshRevoked))assertThat(live(id)).isTrue();assertThat(sweep()).isZero();
    }
    @Test void elapsedHoursRemainExactAcrossSpringDstInNonUtcDatabaseTransaction(){
        Instant cutoff=Instant.parse("2026-03-29T12:00:00Z"),now=cutoff.plus(Duration.ofDays(30));UUID exact=session(business,cutoff.minus(Duration.ofHours(168)),now,null),fresh=session(business,cutoff.minus(Duration.ofHours(168)).plusMillis(1),now,null);var job=new SessionRetention(new JdbcTemplate(runtime),Clock.fixed(now,ZoneOffset.UTC));
        int count=tx.execute(t->{new JdbcTemplate(runtime).execute("SET LOCAL TIME ZONE 'Europe/Belgrade'");return job.cleanup();});assertThat(count).isEqualTo(1);assertThat(live(exact)).isFalse();assertThat(live(fresh)).isTrue();
    }
    @Test void unresolvedCredentialWorkAndRecentTerminalWorkDeferThenConverge(){
        UUID held=old(),op=operation(held,"UNKNOWN",CUTOFF),recent=old(),recentOp=operation(recent,"COMPLETED",CUTOFF.plusMillis(1)),done=old(),doneOp=operation(done,"COMPLETED",CUTOFF);
        String before=owner.queryForObject("SELECT to_jsonb(o)::text FROM credential_operation o WHERE id=?",String.class,doneOp);assertThat(sweep()).isEqualTo(1);assertThat(live(held)).isTrue();assertThat(live(recent)).isTrue();assertThat(owner.queryForObject("SELECT to_jsonb(o)::text FROM credential_operation o WHERE id=?",String.class,doneOp)).isEqualTo(before);
        owner.update("UPDATE credential_operation SET state='APPLIED',updated_at=? WHERE id=?",at(CUTOFF),op);owner.update("UPDATE credential_operation SET state='COMPLETED',updated_at=? WHERE id=?",at(CUTOFF),op);assertThat(sweep()).isEqualTo(1);assertThat(live(held)).isFalse();
    }
    @Test void claimedAndRecentOAuthWorkDeferOriginalIdentityRemains(){UUID held=old(),claimed=challenge(held,"CLAIMED",CUTOFF),recent=old(),fresh=challenge(recent,"OPEN",CUTOFF.plusMillis(1)),done=old(),ended=challenge(done,"COMPLETED",CUTOFF);String before=owner.queryForObject("SELECT to_jsonb(c)::text FROM external_challenge c WHERE id=?",String.class,ended);assertThat(sweep()).isEqualTo(1);assertThat(live(held)).isTrue();assertThat(live(recent)).isTrue();assertThat(owner.queryForObject("SELECT to_jsonb(c)::text FROM external_challenge c WHERE id=?",String.class,ended)).isEqualTo(before);}
    @Test void oldIdsCannotBeReusedAndBindingsCannotBeAlteredOrDeleted(){UUID id=old();assertThat(sweep()).isEqualTo(1);assertThatThrownBy(()->owner.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?,'PASSWORD',0,0)",id,admin,hash(IDS.next()),at(NOW),at(NOW),at(NOW.plusSeconds(3600)),at(NOW))).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThatThrownBy(()->owner.update("UPDATE application_session_identity SET account_id=? WHERE id=?",business,id)).hasStackTraceContaining("Session identity binding retained");assertThatThrownBy(()->owner.update("DELETE FROM application_session_identity WHERE id=?",id)).hasStackTraceContaining("Session identity binding retained");assertThatThrownBy(()->operation(id,"COMPLETED",CUTOFF)).hasStackTraceContaining("Live original session required");assertThatThrownBy(()->challenge(id,"OPEN",CUTOFF)).hasStackTraceContaining("Live original session required");}
    @Test void bindingReservationsRollBackWithFailedSessionInsertAndCannotCrossAccounts(){
        UUID id=IDS.next();assertThatThrownBy(()->owner.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?,'PASSWORD',0,0)",id,admin,hash(id),at(NOW),at(NOW),at(NOW),at(NOW))).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThat(owner.queryForObject("SELECT EXISTS(SELECT 1 FROM application_session_identity WHERE id=?)",Boolean.class,id)).isFalse();UUID foreign=session(business,NOW,NOW.plusSeconds(3600),null);assertThatThrownBy(()->operation(foreign,"COMPLETED",CUTOFF)).hasStackTraceContaining("Live original session required");
    }
    @Test void oneThousandBoundConvergesAndRetainsEveryBinding(){
        var ids=owner.queryForList("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) SELECT id,?,'NATIVE',decode(md5(id::text)||md5(id::text),'hex'),'Synthetic',?,?,?,?,'PASSWORD',0,0 FROM(SELECT gen_random_uuid() AS id FROM generate_series(1,1006)) s RETURNING id",UUID.class,admin,at(CUTOFF.minusSeconds(3600)),at(CUTOFF.minusSeconds(3600)),at(CUTOFF),at(CUTOFF.minusSeconds(3600)));assertThat(sweep()).isEqualTo(1000);assertThat(sweep()).isEqualTo(6);assertThat(owner.queryForObject("SELECT count(*) FROM application_session_identity WHERE id=ANY(?)",Integer.class,(Object)ids.toArray(UUID[]::new))).isEqualTo(1006);
    }
    @Test void twoWorkersSkipLockedLiveSessionThenRetry()throws Exception{UUID held=old(),free=old();try(var c=owner.getDataSource().getConnection()){c.setAutoCommit(false);try(var q=c.prepareStatement("SELECT id FROM application_session WHERE id=? FOR UPDATE")){q.setObject(1,held);q.execute();}try(var pool=Executors.newFixedThreadPool(2)){var a=pool.submit(this::sweep);var b=pool.submit(this::sweep);assertThat(a.get(10,TimeUnit.SECONDS)+b.get(10,TimeUnit.SECONDS)).isEqualTo(1);}assertThat(live(held)).isTrue();assertThat(live(free)).isFalse();c.rollback();}assertThat(sweep()).isEqualTo(1);}
    @Test void deviceInvalidationAndSessionDeletionAreAtomicWithRollback(){UUID id=old(),device=IDS.next(),installation=IDS.next();String token=HexFormat.of().formatHex(hash(device));owner.update("INSERT INTO push_token_claim(environment,token_hash,account_id) VALUES('synthetic',?,?)",token,admin);owner.update("INSERT INTO push_device(id,environment,installation_id,account_id,session_id,platform,token_hash,token_envelope,created_at) VALUES(?,'synthetic',?,?,?,'WEB',?,?,?)",device,installation,admin,id,token,new byte[71],at(CUTOFF.minusSeconds(3600)));assertThatThrownBy(()->tx.executeWithoutResult(t->{assertThat(service.cleanup()).isEqualTo(1);throw new IllegalStateException("Synthetic rollback");})).isInstanceOf(IllegalStateException.class);assertThat(live(id)).isTrue();assertThat(owner.queryForObject("SELECT enabled AND token_envelope IS NOT NULL FROM push_device WHERE id=?",Boolean.class,device)).isTrue();assertThat(sweep()).isEqualTo(1);assertThat(owner.queryForObject("SELECT NOT enabled AND token_envelope IS NULL FROM push_device WHERE id=?",Boolean.class,device)).isTrue();assertThat(owner.queryForObject("SELECT eligible FROM push_device_eligibility WHERE id=?",Boolean.class,device)).isFalse();assertThat(owner.queryForObject("SELECT account_id FROM push_token_claim WHERE environment='synthetic' AND token_hash=?",UUID.class,token)).isEqualTo(admin);}
    @Test void runtimeHasNoIdentityHistoryOrDeviceWriteAuthorityAndPreviewAgrees()throws Exception{
        UUID id=old();var limited=new JdbcTemplate(runtime);assertThatThrownBy(()->limited.update("DELETE FROM application_session_identity WHERE id=?",id)).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThatThrownBy(()->limited.update("DELETE FROM credential_operation")).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThatThrownBy(()->limited.update("UPDATE push_device SET enabled=false")).isInstanceOf(org.springframework.dao.DataAccessException.class);String preview=Files.readString(Path.of("retention/session-preview.sql"));try(var c=runtime.getConnection();var q=c.createStatement()){q.execute(preview);do{if(q.getResultSet()!=null){var r=q.getResultSet();assertThat(r.next()).isTrue();assertThat(r.getLong("eligible_sessions")).isEqualTo(1);}}while(q.getMoreResults()||q.getUpdateCount()!=-1);}assertThat(live(id)).isTrue();assertThat(sweep()).isEqualTo(1);
    }
}
