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
class IdentitySecretRetentionIT {
    @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
    static final Instant NOW=Instant.parse("2026-10-21T12:00:00Z"),CUTOFF=NOW.minus(Duration.ofDays(30));
    static final UuidGenerator IDS=new UuidGenerator(Clock.fixed(NOW,ZoneOffset.UTC));
    static JdbcTemplate owner;static DriverManagerDataSource runtime;static UUID creator,reviewer,account,member,org;
    IdentitySecretRetention service;TransactionTemplate tx;
    enum Family {
        RESET("password_reset_delivery","proof_id"),EMAIL_PROOF("email_change_delivery","proof_id"),SETUP("setup_delivery","id"),RECOVERY("recovery_delivery","id");
        final String table,key;Family(String table,String key){this.table=table;this.key=key;}
    }
    record Secret(Family family,UUID id,UUID parent){}
    @BeforeAll static void schema(){
        MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());owner=new JdbcTemplate(ds);
        creator=admin();reviewer=admin();account=IDS.next();member=IDS.next();org=IDS.next();
        new TransactionTemplate(new DataSourceTransactionManager(ds)).executeWithoutResult(t->{
            for(UUID id:List.of(account,member))owner.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'BUSINESS',?,true,'Synthetic','ACTIVE')",id,id+"@example.com");
            owner.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES(?,'BUYER','RS','RSD','Synthetic','Synthetic','SYN-SECRET-RETENTION','Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",org,account);
            owner.update("INSERT INTO business_account(id,organization_id,role) VALUES(?,?,'OWNER'),(?,?,'STAFF')",account,org,member,org);
        });
        owner.execute("CREATE ROLE identity_retention_runtime LOGIN PASSWORD 'synthetic-local-only'");owner.execute("GRANT USAGE ON SCHEMA public TO identity_retention_runtime");
        owner.execute("GRANT SELECT ON password_reset_delivery,password_reset_proof,email_change_delivery,email_change_proof,email_change,credential_operation,setup_delivery,setup_invitation,setup_email_proof,setup_intent,recovery_delivery,recovery_case,external_delivery_retention_blocker TO identity_retention_runtime");
        owner.execute("GRANT UPDATE(encrypted_token) ON password_reset_delivery,email_change_delivery,setup_delivery,recovery_delivery TO identity_retention_runtime");
        runtime=new DriverManagerDataSource(DB.getJdbcUrl(),"identity_retention_runtime","synthetic-local-only");
    }
    static UUID admin(){UUID id=IDS.next();new TransactionTemplate(new DataSourceTransactionManager(owner.getDataSource())).executeWithoutResult(t->{owner.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",id,id+"@example.com");owner.update("INSERT INTO platform_account(id) VALUES(?)",id);});return id;}
    static byte[] hash(UUID id){try{return java.security.MessageDigest.getInstance("SHA-256").digest(id.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII));}catch(Exception e){throw new IllegalStateException(e);}}
    @BeforeEach void service(){service=new IdentitySecretRetention(new JdbcTemplate(runtime),Clock.fixed(NOW,ZoneOffset.UTC));tx=new TransactionTemplate(new DataSourceTransactionManager(runtime));tx.setTimeout(10);for(Family f:Family.values())sweep(f);}
    int sweep(Family f){return tx.execute(t->switch(f){case RESET->service.reset();case EMAIL_PROOF->service.email();case SETUP->service.setup();case RECOVERY->service.recovery();});}
    UUID operation(UUID actor,String kind,String state){UUID id=IDS.next(),session=null;if(!kind.equals("RESET")){session=IDS.next();owner.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?, 'PASSWORD',0,0)",session,actor,hash(session),Timestamp.from(NOW),Timestamp.from(NOW),Timestamp.from(NOW.plusSeconds(3600)),Timestamp.from(NOW));}
        owner.update("INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,current_session_id,created_at,updated_at) VALUES(?,?,?,?,0,0,?,?,?)",id,actor,kind,state,session,Timestamp.from(NOW),Timestamp.from(NOW));return id;}
    UUID emailParent(Instant expiry,boolean unresolved){UUID id=IDS.next(),op=unresolved?operation(account,"EMAIL","COMPLETED"):null;owner.update("INSERT INTO email_change(id,account_id,request_revision_token,old_email,new_email,security_epoch,credential_generation,state,operation_id,created_at,expires_at,updated_at) VALUES(?,?,?,?,?,0,0,?,?,?,?,?)",id,account,id.toString(),account+"@example.com",id+"@example.com",unresolved?"RECONCILING":"EXPIRED",op,Timestamp.from(expiry.minusSeconds(86400)),Timestamp.from(expiry),Timestamp.from(expiry.minusSeconds(86400)));return id;}
    Secret row(Family f,Instant expiry,boolean unresolved){
        UUID id=IDS.next(),parent=IDS.next();Instant created;
        switch(f){
            case RESET->{UUID actor=unresolved?admin():account,op=unresolved?operation(actor,"RESET","UNKNOWN"):null;created=expiry.minusSeconds(1800);owner.update("INSERT INTO password_reset_proof(id,account_id,token_hash,email,security_epoch,credential_generation,state,operation_id,created_at,expires_at) VALUES(?,?,?,?,0,0,?,?,?,?)",id,actor,hash(id),actor+"@example.com",unresolved?"USED":"INVALIDATED",op,Timestamp.from(created),Timestamp.from(expiry));parent=id;}
            case EMAIL_PROOF->{parent=emailParent(expiry,unresolved);created=expiry.minusSeconds(86400);owner.update("INSERT INTO email_change_proof(id,change_id,side,token_hash) VALUES(?,?,'NEW',?)",id,parent,hash(id));}
            case SETUP->{return setupRow(expiry,1,1,expiry.minusSeconds(7*86400),unresolved);}
            case RECOVERY->{created=expiry.minusSeconds(8*86400);UUID change=unresolved?emailParent(expiry,false):null;owner.update("INSERT INTO recovery_case(id,creator_id,creator_epoch,reviewer_id,reviewer_epoch,organization_id,target_id,former_owner_id,target_epoch,target_generation,owner_epoch,owner_generation,kind,old_email,new_email,reason,evidence_reference,request_digest,state,token_hash,consumed_at,email_change_id,created_at,not_before,expires_at,updated_at) VALUES(?,?,0,?,0,?,?,?,0,0,0,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",parent,creator,reviewer,org,unresolved?account:member,account,unresolved?"EMAIL":"OWNER",account+"@example.com",unresolved?parent+"@example.com":null,"Synthetic private reason","synthetic/reference",hash(parent),unresolved?"RECONCILING":"NOTICE_PERIOD",hash(id),unresolved?Timestamp.from(created.plusSeconds(86400)):null,change,Timestamp.from(created),Timestamp.from(expiry.minusSeconds(7*86400)),Timestamp.from(expiry),Timestamp.from(created));}
            default->throw new AssertionError();
        }
        if(f==Family.RECOVERY)owner.update("INSERT INTO recovery_delivery(id,case_id,kind,recipient_id,destination_email,encrypted_token,locale,state,created_at) VALUES(?,?,'ACCEPTANCE',?,?,?,'en','QUEUED',?)",id,parent,member,member+"@example.com",new byte[71],Timestamp.from(created));
        else owner.update("INSERT INTO "+f.table+"(proof_id,encrypted_token,locale,state,created_at) VALUES(?,?,'en','QUEUED',?)",id,new byte[71],Timestamp.from(created));
        return new Secret(f,id,parent);
    }
    Secret setupRow(Instant expiry,int parentGeneration,int sourceGeneration,Instant created,boolean unresolved){UUID id=IDS.next(),parent=IDS.next();owner.update("INSERT INTO setup_invitation(id,sender_id,recipient_email,country,type,reason,token_hash,generation,state,created_at,updated_at,expires_at) VALUES(?,?,?,'RS','BUYER','Synthetic',?,?,'PENDING',?,?,?)",parent,creator,parent+"@example.com",hash(parent),parentGeneration,Timestamp.from(created.isBefore(expiry.minusSeconds(7*86400))?created:expiry.minusSeconds(7*86400)),Timestamp.from(expiry.minusSeconds(7*86400)),Timestamp.from(expiry));
        owner.update("INSERT INTO setup_delivery(id,invitation_id,generation,encrypted_token,recipient_email,locale,state,created_at) VALUES(?,?,?,?,?,'en','QUEUED',?)",id,parent,sourceGeneration,new byte[71],parent+"@example.com",Timestamp.from(created));
        if(unresolved)owner.update("INSERT INTO setup_intent(id,invitation_id,generation,tenant_id,provider_user_id,account_id,organization_id,payload,request_digest,state,created_at,updated_at) VALUES(?,?,?, ?,?,?,?,'Synthetic',?,'UNKNOWN',?,?)",IDS.next(),parent,parentGeneration,IDS.next(),IDS.next(),IDS.next(),IDS.next(),hash(id),Timestamp.from(created),Timestamp.from(created));return new Secret(Family.SETUP,id,parent);}
    boolean present(Secret s){return owner.queryForObject("SELECT encrypted_token IS NOT NULL FROM "+s.family.table+" WHERE "+s.family.key+"=?",Boolean.class,s.id);}
    String metadata(Secret s){return owner.queryForObject("SELECT (to_jsonb(d)-'encrypted_token')::text FROM "+s.family.table+" d WHERE "+s.family.key+"=?",String.class,s.id);}
    String parentSnapshot(Secret s){String table=switch(s.family){case RESET->"password_reset_proof";case EMAIL_PROOF->"email_change";case SETUP->"setup_invitation";case RECOVERY->"recovery_case";};return owner.queryForObject("SELECT to_jsonb(p)::text FROM "+table+" p WHERE id=?",String.class,s.parent);}
    UUID delivery(Secret s,String state){UUID id=IDS.next();owner.update("INSERT INTO external_fanout(source_kind,source_id,created_at) VALUES(?,?,?)",s.family.name(),s.id,Timestamp.from(NOW));owner.update("INSERT INTO external_job(id,source_kind,source_id,channel,state,fence,lease_until,next_attempt_at,terminal_at,created_at) VALUES(?,?,?,'EMAIL',?,?,?,?,?,?)",id,s.family.name(),s.id,state,state.equals("SENDING")?IDS.next():null,state.equals("SENDING")?Timestamp.from(NOW.plusSeconds(60)):null,Timestamp.from(NOW),state.equals("SENDING")?null:Timestamp.from(NOW.minusSeconds(40*86400)),Timestamp.from(NOW.minusSeconds(40*86400)));return id;}

    @Test void exactCutoffAllFamiliesKeepsOriginalProofParentAndSourceMetadata(){
        for(Family f:Family.values()){var old=row(f,CUTOFF,false);var fresh=row(f,CUTOFF.plusMillis(1),false);String before=metadata(old),parent=parentSnapshot(old);assertThat(sweep(f)).isEqualTo(1);assertThat(present(old)).isFalse();assertThat(present(fresh)).isTrue();assertThat(metadata(old)).isEqualTo(before);assertThat(parentSnapshot(old)).isEqualTo(parent);assertThat(sweep(f)).isZero();}
    }
    @Test void uncertainAndSendingProviderJobsDeferAllFamiliesUntilDefiniteResolution(){
        for(Family f:Family.values())for(String state:List.of("UNKNOWN","SENDING")){var secret=row(f,CUTOFF,false);UUID job=delivery(secret,state);String before=metadata(secret);assertThat(sweep(f)).isZero();assertThat(present(secret)).isTrue();owner.update("UPDATE external_job SET state='DELIVERED',fence=NULL,lease_until=NULL WHERE id=?",job);assertThat(sweep(f)).isEqualTo(1);assertThat(present(secret)).isFalse();assertThat(metadata(secret)).isEqualTo(before);}
    }
    @Test void unfinishedCredentialEmailSetupAndRecoveryParentsRemainUntouched(){for(Family f:Family.values()){var secret=row(f,CUTOFF,true);String before=metadata(secret),parent=parentSnapshot(secret);assertThat(sweep(f)).isZero();assertThat(present(secret)).isTrue();assertThat(metadata(secret)).isEqualTo(before);assertThat(parentSnapshot(secret)).isEqualTo(parent);}}
    @Test void oneThousandBoundConvergesWithProofHashesAndSourceRowsRetained(){
        var ids=owner.queryForList("WITH proofs AS(INSERT INTO password_reset_proof(id,account_id,token_hash,email,security_epoch,credential_generation,state,created_at,expires_at) SELECT id,?,decode(md5(id::text)||md5(id::text),'hex'),?,0,0,'INVALIDATED',?,? FROM(SELECT gen_random_uuid() AS id FROM generate_series(1,1006)) s RETURNING id,created_at) INSERT INTO password_reset_delivery(proof_id,encrypted_token,locale,state,created_at) SELECT id,decode(repeat('11',71),'hex'),'en','QUEUED',created_at FROM proofs RETURNING proof_id",UUID.class,account,account+"@example.com",Timestamp.from(CUTOFF.minusSeconds(1800)),Timestamp.from(CUTOFF));
        assertThat(sweep(Family.RESET)).isEqualTo(1000);assertThat(owner.queryForObject("SELECT count(*) FROM password_reset_delivery WHERE proof_id=ANY(?) AND encrypted_token IS NOT NULL",Integer.class,(Object)ids.toArray(UUID[]::new))).isEqualTo(6);assertThat(sweep(Family.RESET)).isEqualTo(6);
        assertThat(owner.queryForObject("SELECT count(*) FROM password_reset_delivery d JOIN password_reset_proof p ON p.id=d.proof_id WHERE p.id=ANY(?) AND octet_length(p.token_hash)=32",Integer.class,(Object)ids.toArray(UUID[]::new))).isEqualTo(1006);
    }
    @Test void actualHeldSourceRowsAreSkippedByTwoWorkersThenDrain()throws Exception{
        var held=new ArrayList<Secret>();var free=new ArrayList<Secret>();for(Family f:Family.values()){held.add(row(f,CUTOFF,false));free.add(row(f,CUTOFF,false));}
        try(var c=owner.getDataSource().getConnection()){c.setAutoCommit(false);for(var s:held)try(var q=c.prepareStatement("SELECT "+s.family.key+" FROM "+s.family.table+" WHERE "+s.family.key+"=? FOR UPDATE")){q.setObject(1,s.id);q.execute();}
            try(var pool=Executors.newFixedThreadPool(2)){var a=pool.submit(()->Arrays.stream(Family.values()).mapToInt(this::sweep).sum());var b=pool.submit(()->Arrays.stream(Family.values()).mapToInt(this::sweep).sum());assertThat(a.get(8,TimeUnit.SECONDS)+b.get(8,TimeUnit.SECONDS)).isEqualTo(4);}
            for(var s:held)assertThat(present(s)).isTrue();for(var s:free)assertThat(present(s)).isFalse();c.rollback();}
        for(Family f:Family.values())assertThat(sweep(f)).isEqualTo(1);
    }
    @Test void clearingIsOneWayAndCannotChangeSourceMetadataOrDeleteHistory(){
        for(Family f:Family.values()){var s=row(f,CUTOFF,false);assertThatThrownBy(()->owner.update("UPDATE "+f.table+" SET encrypted_token=NULL,locale='sr-Latn-RS' WHERE "+f.key+"=?",s.id)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("immutable");assertThat(sweep(f)).isEqualTo(1);assertThatThrownBy(()->owner.update("INSERT INTO "+f.table+" SELECT (jsonb_populate_record(NULL::"+f.table+",to_jsonb(d)-'encrypted_token')).* FROM "+f.table+" d WHERE "+f.key+"=?",s.id)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("Initial delivery secret required");assertThatThrownBy(()->owner.update("UPDATE "+f.table+" SET encrypted_token=? WHERE "+f.key+"=?",new byte[71],s.id)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("immutable");assertThatThrownBy(()->owner.update("DELETE FROM "+f.table+" WHERE "+f.key+"=?",s.id)).isInstanceOf(org.springframework.dao.DataAccessException.class);}
    }
    @Test void secondRowFailureRollsBackAnAlreadyStartedBatch(){
        var a=row(Family.RESET,CUTOFF,false);var b=row(Family.RESET,CUTOFF,false);
        owner.execute("CREATE FUNCTION synthetic_secret_failure() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE seen integer:=coalesce(nullif(current_setting('synthetic.secret_seen',true),''),'0')::integer;BEGIN PERFORM set_config('synthetic.secret_seen',(seen+1)::text,true);IF seen=1 THEN RAISE EXCEPTION 'Synthetic second-row failure';END IF;RETURN NEW;END $$");owner.execute("CREATE TRIGGER tr_synthetic_secret_failure BEFORE UPDATE ON password_reset_delivery FOR EACH ROW EXECUTE FUNCTION synthetic_secret_failure()");
        try{assertThatThrownBy(()->sweep(Family.RESET)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("second-row failure");assertThat(present(a)).isTrue();assertThat(present(b)).isTrue();}finally{owner.execute("DROP TRIGGER tr_synthetic_secret_failure ON password_reset_delivery");owner.execute("DROP FUNCTION synthetic_secret_failure()");}assertThat(sweep(Family.RESET)).isEqualTo(2);
    }
    @Test void previewIsReadOnlyAggregateOnlyAndMatchesEligibleAndDeferredSources()throws Exception{
        var a=row(Family.RESET,CUTOFF,false);var b=row(Family.RESET,CUTOFF,false);delivery(b,"UNKNOWN");
        String source=Files.readString(Path.of(System.getProperty("basedir"),"retention/identity-secret-preview.sql")).replace("\r\n","\n");String sql=source.substring(source.indexOf("WITH cutoff"),source.indexOf(";\nROLLBACK")).replace(":'retention_at'","'"+NOW+"'");
        try(var c=runtime.getConnection()){c.setReadOnly(true);c.setAutoCommit(false);try(var q=c.createStatement()){q.setQueryTimeout(10);try(var rows=q.executeQuery(sql)){int count=0;while(rows.next()){count++;if(rows.getString("family").equals("reset")){assertThat(rows.getLong("eligible_secrets")).isEqualTo(1);assertThat(rows.getLong("deferred_sends")).isGreaterThanOrEqualTo(1);}}assertThat(count).isEqualTo(4);assertThat(rows.getMetaData().getColumnCount()).isEqualTo(4);}}c.rollback();}assertThat(present(a)).isTrue();assertThat(present(b)).isTrue();
    }
    @Test void oldSetupGenerationUsesThirtySevenDaysAndFutureGenerationNeverClears(){
        var old=setupRow(NOW.plusSeconds(86400),2,1,NOW.minusSeconds(37*86400),false);var young=setupRow(NOW.plusSeconds(86400),2,1,NOW.minusSeconds(37*86400).plusMillis(1),false);var future=setupRow(CUTOFF,1,2,NOW.minusSeconds(40*86400),false);
        assertThat(sweep(Family.SETUP)).isEqualTo(1);assertThat(present(old)).isFalse();assertThat(present(young)).isTrue();assertThat(present(future)).isTrue();
        // The extra168 hours must be elapsed time even across the October DST change.
        Instant later=Instant.parse("2026-11-26T12:00:00Z");var exact=setupRow(later.plusSeconds(86400),2,1,later.minusSeconds(37*86400),false);var notYet=setupRow(later.plusSeconds(86400),2,1,later.minusSeconds(37*86400).plusMillis(1),false);
        var laterService=new IdentitySecretRetention(new JdbcTemplate(runtime),Clock.fixed(later,ZoneOffset.UTC));
        tx.executeWithoutResult(t->{new JdbcTemplate(runtime).execute("SET LOCAL TIME ZONE 'Europe/Belgrade'");laterService.setup();});assertThat(present(exact)).isFalse();assertThat(present(notYet)).isTrue();
    }
}
