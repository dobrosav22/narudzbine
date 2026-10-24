package com.narudzbine.notifications.infrastructure;

import static org.assertj.core.api.Assertions.*;

import com.narudzbine.notifications.api.ProviderDelivery;
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
class DeliveryBodyRetentionIT {
    @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
    static final Instant NOW=Instant.parse("2026-10-21T12:00:00Z");
    static JdbcTemplate owner;
    static DriverManagerDataSource runtime;
    ExternalDeliveryEngine engine;
    @BeforeAll static void schema(){
        MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
        owner=new JdbcTemplate(new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()));
        owner.execute("CREATE ROLE delivery_retention_runtime LOGIN PASSWORD 'synthetic-local-only'");
        owner.execute("GRANT USAGE ON SCHEMA public TO delivery_retention_runtime");
        owner.execute("GRANT SELECT ON external_job TO delivery_retention_runtime");
        owner.execute("GRANT UPDATE(rendered_body) ON external_job TO delivery_retention_runtime");
        runtime=new DriverManagerDataSource(DB.getJdbcUrl(),"delivery_retention_runtime","synthetic-local-only");
    }
    @BeforeEach void engine(){
        Clock clock=Clock.fixed(NOW,ZoneOffset.UTC);
        engine=new ExternalDeliveryEngine(new JdbcTemplate(runtime),clock,new UuidGenerator(clock),new DataSourceTransactionManager(runtime),
            (id,mail)->{throw new AssertionError("Compaction must never send");},null,null,(kind,id)->{throw new AssertionError("Compaction must not resolve proofs");},new byte[32],"synthetic@example.com","https://synthetic.example.com");
        engine.compact();
    }
    @AfterEach void close(){engine.close();}
    private UUID row(String state,Instant terminal){
        UUID id=UUID.randomUUID(),source=UUID.randomUUID();
        owner.update("INSERT INTO external_fanout(source_kind,source_id,created_at) VALUES('RESET',?,?)",source,Timestamp.from(NOW));
        owner.update("INSERT INTO external_job(id,source_kind,source_id,channel,state,attempts,fence,lease_until,next_attempt_at,first_attempt_at,rendered_body,rendered_destination,provider_reference,terminal_at,created_at) VALUES(?,'RESET',?,'EMAIL',?,1,?,?,?,?,decode('112233','hex'),'synthetic@example.com',?,?,?)",id,source,state,state.equals("SENDING")?UUID.randomUUID():null,state.equals("SENDING")?Timestamp.from(NOW.plusSeconds(60)):null,Timestamp.from(NOW),Timestamp.from(NOW),id.toString(),terminal==null?null:Timestamp.from(terminal),Timestamp.from(NOW));
        return id;
    }
    private boolean body(UUID id){return Boolean.TRUE.equals(owner.queryForObject("SELECT rendered_body IS NOT NULL FROM external_job WHERE id=?",Boolean.class,id));}
    private String metadata(UUID id){return owner.queryForObject("SELECT (to_jsonb(j)-'rendered_body')::text FROM external_job j WHERE id=?",String.class,id);}
    @Test void inclusiveExpiryPreservesAllTerminalEvidenceAndExcludesActiveWork(){
        var ids=new ArrayList<UUID>();var before=new HashMap<UUID,String>();
        for(String state:List.of("ACCEPTED","DELIVERED","FAILED","UNKNOWN","SUPPRESSED","EXPIRED")){UUID id=row(state,NOW.minusSeconds(604800));ids.add(id);before.put(id,metadata(id));}
        UUID fresh=row("ACCEPTED",NOW.minusSeconds(604800).plusMillis(1));
        UUID queued=row("QUEUED",NOW.minusSeconds(604801)),sending=row("SENDING",NOW.minusSeconds(604801)),missing=row("UNKNOWN",null);
        assertThat(engine.compact()).isEqualTo(6);
        for(UUID id:ids){assertThat(body(id)).isFalse();assertThat(metadata(id)).isEqualTo(before.get(id));}
        for(UUID id:List.of(fresh,queued,sending,missing))assertThat(body(id)).isTrue();
        assertThat(engine.compact()).isZero();
    }
    private int bodyCount(List<UUID> ids){return owner.queryForObject("SELECT count(*) FROM external_job WHERE id=ANY(?) AND rendered_body IS NOT NULL",Integer.class,(Object)ids.toArray(UUID[]::new));}
    @Test void oneThousandRowBoundConvergesWithoutDeletingJobOrFanout(){
        var ids=owner.queryForList("WITH sources AS(INSERT INTO external_fanout(source_kind,source_id,created_at) SELECT 'RESET',gen_random_uuid(),? FROM generate_series(1,1006) RETURNING source_id,created_at) INSERT INTO external_job(id,source_kind,source_id,channel,state,next_attempt_at,rendered_body,terminal_at,created_at) SELECT gen_random_uuid(),'RESET',source_id,'EMAIL','ACCEPTED',created_at,decode('11','hex'),?,created_at FROM sources RETURNING id",UUID.class,Timestamp.from(NOW),Timestamp.from(NOW.minusSeconds(604800)));
        assertThat(engine.compact()).isEqualTo(1000);assertThat(bodyCount(ids)).isEqualTo(6);
        assertThat(engine.compact()).isEqualTo(6);assertThat(bodyCount(ids)).isZero();
        assertThat(owner.queryForObject("SELECT count(*) FROM external_job j JOIN external_fanout f ON(f.source_kind,f.source_id)=(j.source_kind,j.source_id) WHERE j.id=ANY(?)",Integer.class,(Object)ids.toArray(UUID[]::new))).isEqualTo(1006);
    }
    @Test void twoWorkersSkipAnActuallyLockedRowAndLaterConverge()throws Exception{
        UUID held=row("UNKNOWN",NOW.minusSeconds(604800)),free=row("DELIVERED",NOW.minusSeconds(604800));
        try(var c=owner.getDataSource().getConnection()){
            c.setAutoCommit(false);try(var q=c.prepareStatement("SELECT id FROM external_job WHERE id=? FOR UPDATE")){q.setObject(1,held);q.execute();}
            try(var pool=Executors.newFixedThreadPool(2)){
                var a=pool.submit(()->engine.compact());var b=pool.submit(()->engine.compact());
                assertThat(a.get(5,TimeUnit.SECONDS)+b.get(5,TimeUnit.SECONDS)).isEqualTo(1);
            }
            assertThat(body(held)).isTrue();assertThat(body(free)).isFalse();c.rollback();
        }
        assertThat(engine.compact()).isEqualTo(1);assertThat(body(held)).isFalse();
    }
    @Test void databaseFailureRollsBackTheWholeSelectedBatch(){
        UUID a=row("ACCEPTED",NOW.minusSeconds(604800)),b=row("FAILED",NOW.minusSeconds(604800));
        owner.execute("CREATE FUNCTION synthetic_retention_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='"+b+"'::uuid THEN RAISE EXCEPTION 'Synthetic retention failure';END IF;RETURN NEW;END $$");
        owner.execute("CREATE TRIGGER tr_synthetic_retention_failure BEFORE UPDATE ON external_job FOR EACH ROW EXECUTE FUNCTION synthetic_retention_failure()");
        try{assertThatThrownBy(()->engine.compact()).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThat(body(a)).isTrue();assertThat(body(b)).isTrue();}
        finally{owner.execute("DROP TRIGGER tr_synthetic_retention_failure ON external_job");owner.execute("DROP FUNCTION synthetic_retention_failure()");}
        assertThat(engine.compact()).isEqualTo(2);
    }
    @Test void missingColumnGrantDefersWithoutChangingTheBodyThenRetryWorks(){
        UUID id=row("ACCEPTED",NOW.minusSeconds(604800));owner.execute("REVOKE UPDATE(rendered_body) ON external_job FROM delivery_retention_runtime");
        try{assertThatThrownBy(()->engine.compact()).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThat(body(id)).isTrue();}
        finally{owner.execute("GRANT UPDATE(rendered_body) ON external_job TO delivery_retention_runtime");}
        assertThat(engine.compact()).isEqualTo(1);assertThat(body(id)).isFalse();
    }
    @Test void oneWayBodyGuardsPreserveCallbackTransitionsAndPreventActiveClearing()throws Exception{
        UUID unknown=row("UNKNOWN",NOW.minusSeconds(604800));UUID active=row("QUEUED",null);UUID accepted=row("ACCEPTED",NOW.minusSeconds(604800));
        assertThatThrownBy(()->owner.update("UPDATE external_job SET rendered_body=NULL,terminal_at=? WHERE id=?",Timestamp.from(NOW),accepted)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("Invalid delivery body compaction");
        assertThatThrownBy(()->owner.update("UPDATE external_job SET rendered_body=NULL WHERE id=?",active)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("Invalid delivery body compaction");
        assertThat(engine.compact()).isEqualTo(2);
        for(UUID id:List.of(unknown,accepted))assertThatThrownBy(()->owner.update("UPDATE external_job SET rendered_body=decode('11','hex') WHERE id=?",id)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("cannot be restored");
        // Exercise the real signed callback handler after the UNKNOWN request cache has expired.
        byte[] key=new byte[32];String callbackId="synthetic_"+UUID.randomUUID(),timestamp=Long.toString(NOW.getEpochSecond());
        byte[] raw=("{\"type\":\"email.delivered\",\"created_at\":\""+NOW+"\",\"data\":{\"email_id\":\""+unknown+"\"}}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
        var mac=javax.crypto.Mac.getInstance("HmacSHA256");mac.init(new javax.crypto.spec.SecretKeySpec(key,"HmacSHA256"));mac.update((callbackId+"."+timestamp+".").getBytes(java.nio.charset.StandardCharsets.US_ASCII));String signature="v1,"+Base64.getEncoder().encodeToString(mac.doFinal(raw));
        var callbacks=new EmailCallbacks(owner,Clock.fixed(NOW,ZoneOffset.UTC),new DataSourceTransactionManager(owner.getDataSource()),"whsec_"+Base64.getEncoder().encodeToString(key),null,null);
        callbacks.receive(callbackId,timestamp,signature,raw);callbacks.receive(callbackId,timestamp,signature,raw);
        assertThat(owner.queryForObject("SELECT state FROM external_job WHERE id=?",String.class,unknown)).isEqualTo("DELIVERED");assertThat(body(unknown)).isFalse();
        assertThat(owner.queryForObject("SELECT count(*) FROM email_callback WHERE id=?",Integer.class,callbackId)).isEqualTo(1);
        assertThatThrownBy(()->owner.update("DELETE FROM external_job WHERE id=?",unknown)).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    @Test void previewRunsReadOnlyAndReturnsOnlyAggregateStateCounts()throws Exception{
        UUID id=row("UNKNOWN",NOW.minusSeconds(604800));String before=metadata(id);
        String source=Files.readString(Path.of(System.getProperty("basedir"),"retention/delivery-body-preview.sql")).replace("\r\n","\n");
        String sql=source.substring(source.indexOf("SELECT "),source.indexOf(";\nROLLBACK")).replace(":'retention_at'","'"+NOW+"'");
        try(var c=runtime.getConnection()){c.setReadOnly(true);c.setAutoCommit(false);try(var q=c.createStatement()){q.setQueryTimeout(10);try(var rows=q.executeQuery(sql)){assertThat(rows.getMetaData().getColumnCount()).isEqualTo(3);boolean found=false;while(rows.next())if(rows.getString("state").equals("UNKNOWN")){found=true;assertThat(rows.getLong("eligible_bodies")).isGreaterThanOrEqualTo(1);}assertThat(found).isTrue();}}c.rollback();}
        assertThat(metadata(id)).isEqualTo(before);assertThat(body(id)).isTrue();
    }
    @Test void compactionCommitsIndependentlyOfCallerRollback(){
        UUID id=row("ACCEPTED",NOW.minusSeconds(604800));var outer=new TransactionTemplate(new DataSourceTransactionManager(runtime));
        outer.executeWithoutResult(t->{assertThat(engine.compact()).isEqualTo(1);t.setRollbackOnly();});assertThat(body(id)).isFalse();
    }
}
