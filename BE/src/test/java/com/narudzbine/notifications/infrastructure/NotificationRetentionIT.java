package com.narudzbine.notifications.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import com.zaxxer.hikari.*;
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
class NotificationRetentionIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 static final Instant NOW=Instant.parse("2026-10-21T12:00:00Z"),OLD=NOW.minus(Duration.ofDays(90));
 static HikariDataSource source;static JdbcTemplate owner,jdbc;static TransactionTemplate tx,ownerTx;static JdbcNotificationRetention retention;UUID account;
 static Timestamp at(Instant i){return Timestamp.from(i);}
 @BeforeAll static void role(){new JdbcTemplate(new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword())).execute("CREATE ROLE notification_retention_runtime LOGIN PASSWORD 'synthetic-local-only'");}
 @BeforeEach void fixture()throws Exception{
  // A fresh database per test preserves every append-only/anti-TRUNCATE production guard.
  String database="notification_"+UUID.randomUUID().toString().replace("-","");new JdbcTemplate(new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword())).execute("CREATE DATABASE "+database);
  String url="jdbc:postgresql://"+DB.getHost()+":"+DB.getMappedPort(5432)+"/"+database;
  MigrationCommand.migrate(url,DB.getUsername(),DB.getPassword());
  source=new HikariDataSource();source.setJdbcUrl(url);source.setUsername(DB.getUsername());source.setPassword(DB.getPassword());source.setMaximumPoolSize(6);owner=new JdbcTemplate(source);ownerTx=new TransactionTemplate(new DataSourceTransactionManager(source));
  owner.execute("GRANT USAGE ON SCHEMA public TO notification_retention_runtime");owner.execute("GRANT SELECT ON inbox_work,notification,external_job,email_callback TO notification_retention_runtime");
  owner.execute(Files.readString(Path.of("retention/notification-grants.sql" )).replace("__RUNTIME_ROLE__","notification_retention_runtime"));
  var ds=new DriverManagerDataSource(url,"notification_retention_runtime","synthetic-local-only");jdbc=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));tx.setTimeout(10);retention=new JdbcNotificationRetention(jdbc,Clock.fixed(NOW,ZoneOffset.UTC));account=UUID.randomUUID();
  ownerTx.executeWithoutResult(s->{owner.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",account,account+"@example.com");owner.update("INSERT INTO platform_account(id) VALUES(?)",account);});
 }
 @AfterEach void close(){if(source!=null)source.close();}
 int sweep(String family){return tx.execute(s->switch(family){case "inbox"->retention.inbox();case "delivery"->retention.deliveries();default->retention.callbacks();});}
 UUID inbox(Instant created,String state){UUID id=UUID.randomUUID(),op=UUID.randomUUID();ownerTx.executeWithoutResult(s->{owner.update("INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,created_at,updated_at) VALUES(?,?,'RESET','COMPLETED',0,0,?,?)",op,account,at(created),at(created));owner.update("INSERT INTO security_notice(id,event_key,resource_id,credential_operation_id,recipient_account_id,locale,created_at) VALUES(?,'PASSWORD_CHANGED',?,?,?,'en',?)",id,op,op,account,at(created));if(state.equals("PUBLISHED"))owner.update("INSERT INTO notification(id,recipient_account_id,event_key,text,created_at) VALUES(?,?,'PASSWORD_CHANGED','Synthetic notice',?)",id,account,at(created));if(!state.equals("QUEUED"))owner.update("UPDATE inbox_work SET state=?,completed_at=? WHERE id=?",state,at(created),id);});return id;}
 UUID job(String state,Instant terminal,boolean body,String reference){UUID id=UUID.randomUUID(),src=UUID.randomUUID();owner.update("INSERT INTO external_fanout(source_kind,source_id,created_at) VALUES('RESET',?,?)",src,at(OLD));owner.update("INSERT INTO external_job(id,source_kind,source_id,channel,state,attempts,fence,lease_until,next_attempt_at,first_attempt_at,rendered_body,rendered_destination,provider_reference,terminal_at,created_at) VALUES(?,'RESET',?,'EMAIL',?,1,?,?,?,?,?,'synthetic@example.com',?,?,?)",id,src,state,state.equals("SENDING")?UUID.randomUUID():null,state.equals("SENDING")?at(NOW.plusSeconds(60)):null,at(OLD),at(OLD),body?new byte[32]:null,reference,terminal==null?null:at(terminal),at(OLD));return id;}
 String callback(UUID reference,Instant received){String id="synthetic_"+UUID.randomUUID();owner.update("INSERT INTO email_callback(id,payload_hash,provider_reference,event_type,received_at) VALUES(?,repeat('a',64),?,'email.delivered',?)",id,reference,at(received));return id;}
 boolean retired(String table,Object id){return owner.queryForObject("SELECT "+(table.equals("inbox_work")?"retired":"metadata_retired")+" FROM "+table+" WHERE id=?",Boolean.class,id);}
 String identity(String table,Object id){String excluded=switch(table){case "inbox_work"->"ARRAY['retired','organization_name','order_reference']";case "external_job"->"ARRAY['metadata_retired','attempts','next_attempt_at','first_attempt_at','rendered_destination','attempted_device_revision','attempted_token_hash','provider_reference']";default->"ARRAY['metadata_retired','provider_reference','event_type','received_at']";};return owner.queryForObject("SELECT(to_jsonb(r)-"+excluded+")::text FROM "+table+" r WHERE id=?",String.class,id);}
 @Test void inboxInclusiveBoundaryPreservesSourceOutcomeAndNeverRepublishes(){
  for(String state:List.of("PUBLISHED","SUPPRESSED","EXPIRED")){UUID id=inbox(OLD,state);String before=identity("inbox_work",id);assertThat(sweep("inbox")).isEqualTo(1);assertThat(retired("inbox_work",id)).isTrue();assertThat(identity("inbox_work",id)).isEqualTo(before);assertThat(owner.queryForObject("SELECT count(*) FROM notification WHERE id=?",Integer.class,id)).isZero();assertThat(new InboxFanout(owner,Clock.fixed(OLD,ZoneOffset.UTC),new DataSourceTransactionManager(source)).publish(id)).isFalse();}
  UUID fresh=inbox(OLD.plusMillis(1),"PUBLISHED"),queued=inbox(OLD,"QUEUED");assertThat(sweep("inbox")).isZero();assertThat(retired("inbox_work",fresh)).isFalse();assertThat(retired("inbox_work",queued)).isFalse();
 }
 @Test void definiteDeliveryBoundaryHoldsUncertainBodyAndRecentCallback(){
  for(String state:List.of("DELIVERED","FAILED","SUPPRESSED","EXPIRED")){UUID id=job(state,OLD,false,UUID.randomUUID().toString());String before=identity("external_job",id);assertThat(sweep("delivery")).isEqualTo(1);assertThat(retired("external_job",id)).isTrue();assertThat(identity("external_job",id)).isEqualTo(before);}
  var held=new ArrayList<UUID>();for(String state:List.of("QUEUED","SENDING","ACCEPTED","UNKNOWN"))held.add(job(state,OLD,false,UUID.randomUUID().toString()));held.add(job("DELIVERED",OLD.plusMillis(1),false,null));held.add(job("DELIVERED",OLD,true,null));UUID recent=UUID.randomUUID();held.add(job("DELIVERED",OLD,false,recent.toString()));callback(recent,OLD.plusMillis(1));assertThat(sweep("delivery")).isZero();for(UUID id:held)assertThat(retired("external_job",id)).isFalse();
 }
 @Test void callbacksWaitForJobRetirementAndUnmappedProviderUncertainty(){
  UUID reference=UUID.randomUUID();UUID job=job("DELIVERED",OLD,false,reference.toString());String id=callback(reference,OLD),before=identity("email_callback",id);assertThat(sweep("callback")).isZero();assertThat(sweep("delivery")).isEqualTo(1);assertThat(sweep("callback")).isEqualTo(1);assertThat(identity("email_callback",id)).isEqualTo(before);assertThat(retired("external_job",job)).isTrue();
  String blocked=callback(UUID.randomUUID(),OLD),fresh=callback(UUID.randomUUID(),OLD.plusMillis(1));UUID unknown=job("UNKNOWN",OLD,false,null);assertThat(sweep("callback")).isZero();owner.update("UPDATE external_job SET state='DELIVERED' WHERE id=?",unknown);assertThat(sweep("callback")).isEqualTo(1);assertThat(retired("email_callback",blocked)).isTrue();assertThat(retired("email_callback",fresh)).isFalse();
 }
 @Test void databaseRejectsPartialPublicationInitialRetirementRestorationAndHistoryDeletion(){
  UUID inbox=inbox(OLD,"PUBLISHED"),job=job("DELIVERED",OLD,false,null);String callback=callback(UUID.randomUUID(),OLD);
  assertThatThrownBy(()->owner.update("DELETE FROM notification WHERE id=?",inbox)).hasStackTraceContaining("retirement required");
  assertThatThrownBy(()->ownerTx.executeWithoutResult(s->owner.update("UPDATE inbox_work SET retired=true,organization_name=NULL,order_reference=NULL WHERE id=?",inbox))).hasStackTraceContaining("publication incomplete");
  assertThat(retired("inbox_work",inbox)).isFalse();
  for(String family:List.of("inbox","delivery","callback"))assertThat(sweep(family)).isEqualTo(1);
  for(var pair:List.of(new Object[]{"inbox_work",inbox},new Object[]{"external_job",job},new Object[]{"email_callback",callback})){String table=(String)pair[0];Object id=pair[1];assertThatThrownBy(()->owner.update("DELETE FROM "+table+" WHERE id=?",id)).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThatThrownBy(()->owner.update("INSERT INTO "+table+" SELECT r.* FROM "+table+" r WHERE id=?",id)).hasStackTraceContaining("Initial");assertThatThrownBy(()->owner.update("UPDATE "+table+" SET "+(table.equals("inbox_work")?"retired":"metadata_retired")+"=false WHERE id=?",id)).isInstanceOf(org.springframework.dao.DataAccessException.class);}
 }
 @Test void sharedInboxBudgetCapsPublishedAndUnpublishedTogether(){
  // A real source per notice; creation triggers, publication checks and row guards remain enabled.
  ownerTx.executeWithoutResult(s->{for(int i=0;i<1006;i++)inbox(OLD,i<500?"PUBLISHED":"EXPIRED");});assertThat(sweep("inbox")).isEqualTo(1000);assertThat(sweep("inbox")).isEqualTo(6);assertThat(sweep("inbox")).isZero();assertThat(owner.queryForObject("SELECT count(*) FROM inbox_work WHERE retired",Integer.class)).isEqualTo(1006);
 }
 @Test void activeOrMixedDeliveryRetirementCannotFallThroughTheOriginalGuard(){
  for(String state:List.of("QUEUED","SENDING","ACCEPTED","UNKNOWN")){UUID id=job(state,OLD,false,null);String before=owner.queryForObject("SELECT to_jsonb(j)::text FROM external_job j WHERE id=?",String.class,id);assertThatThrownBy(()->owner.update("UPDATE external_job SET metadata_retired=true,attempts=NULL,next_attempt_at=NULL,first_attempt_at=NULL,rendered_destination=NULL,attempted_device_revision=NULL,attempted_token_hash=NULL,provider_reference=NULL WHERE id=?",id)).hasStackTraceContaining("Invalid delivery metadata retirement");assertThat(owner.queryForObject("SELECT to_jsonb(j)::text FROM external_job j WHERE id=?",String.class,id)).isEqualTo(before);}
  UUID id=job("DELIVERED",OLD,false,null);assertThatThrownBy(()->owner.update("UPDATE external_job SET metadata_retired=true,attempts=NULL,next_attempt_at=NULL,first_attempt_at=NULL,rendered_destination=NULL,attempted_device_revision=NULL,attempted_token_hash=NULL,provider_reference=NULL,state='QUEUED' WHERE id=?",id)).hasStackTraceContaining("Invalid delivery metadata retirement");assertThat(sweep("delivery")).isEqualTo(1);
 }
 @Test void oneThousandDeliveryBoundPreservesEveryJobAndFanout(){
  owner.update("WITH sources AS(INSERT INTO external_fanout(source_kind,source_id,created_at) SELECT 'RESET',gen_random_uuid(),? FROM generate_series(1,1006) RETURNING source_id,created_at) INSERT INTO external_job(id,source_kind,source_id,channel,state,next_attempt_at,terminal_at,created_at) SELECT gen_random_uuid(),'RESET',source_id,'EMAIL','DELIVERED',created_at,created_at,created_at FROM sources",at(OLD));assertThat(sweep("delivery")).isEqualTo(1000);assertThat(sweep("delivery")).isEqualTo(6);assertThat(owner.queryForObject("SELECT count(*) FROM external_job j JOIN external_fanout f USING(source_kind,source_id) WHERE j.metadata_retired",Integer.class)).isEqualTo(1006);
 }
 @Test void oneThousandCallbackBoundRetainsEveryReplayDigest(){owner.update("INSERT INTO email_callback(id,payload_hash,provider_reference,event_type,received_at) SELECT gen_random_uuid()::text,repeat('a',64),gen_random_uuid(),'email.delivered',? FROM generate_series(1,1006)",at(OLD));assertThat(sweep("callback")).isEqualTo(1000);assertThat(sweep("callback")).isEqualTo(6);assertThat(owner.queryForObject("SELECT count(*) FROM email_callback WHERE metadata_retired AND payload_hash=repeat('a',64)",Integer.class)).isEqualTo(1006);}
 @Test void heldNotificationAndProviderReferenceSkipThenConverge()throws Exception{
  UUID inbox=inbox(OLD,"PUBLISHED"),reference=UUID.randomUUID(),job=job("DELIVERED",OLD,false,reference.toString());String callback=callback(reference,OLD);
  try(var c=source.getConnection()){c.setAutoCommit(false);try(var q=c.prepareStatement("SELECT id FROM notification WHERE id=? FOR UPDATE")){q.setObject(1,inbox);q.execute();}try(var q=c.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?,0))")){q.setString(1,"resend/"+reference);q.execute();}try(var pool=Executors.newSingleThreadExecutor()){assertThat(pool.submit(()->List.of(sweep("inbox"),sweep("delivery"),sweep("callback"))).get(5,TimeUnit.SECONDS)).containsExactly(0,0,0);}c.rollback();}
  assertThat(sweep("inbox")).isEqualTo(1);assertThat(sweep("delivery")).isEqualTo(1);assertThat(sweep("callback")).isEqualTo(1);assertThat(retired("external_job",job)).isTrue();assertThat(retired("email_callback",callback)).isTrue();
 }
 @Test void postWriteFailureRollsBackContentAndMetadata(){
  UUID inbox=inbox(OLD,"PUBLISHED"),job=job("DELIVERED",OLD,false,null);String callback=callback(UUID.randomUUID(),OLD);
  owner.execute("CREATE FUNCTION notification_retention_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic post-write failure';END $$");
  try{for(String table:List.of("notification","external_job","email_callback")){owner.execute("CREATE TRIGGER tr_notification_retention_fail AFTER "+(table.equals("notification")?"DELETE":"UPDATE")+" ON "+table+" FOR EACH STATEMENT EXECUTE FUNCTION notification_retention_fail()");try{assertThatThrownBy(()->sweep(table.equals("notification")?"inbox":table.equals("external_job")?"delivery":"callback")).hasStackTraceContaining("Synthetic post-write failure");}finally{owner.execute("DROP TRIGGER tr_notification_retention_fail ON "+table);}}}finally{owner.execute("DROP FUNCTION notification_retention_fail()");}
  assertThat(retired("inbox_work",inbox)).isFalse();assertThat(retired("external_job",job)).isFalse();assertThat(retired("email_callback",callback)).isFalse();assertThat(owner.queryForObject("SELECT count(*) FROM notification WHERE id=?",Integer.class,inbox)).isEqualTo(1);
 }
 @Test void missingDeleteGrantRollsBackInboxAndOtherFamiliesRemainUsable(){
  UUID id=inbox(OLD,"PUBLISHED");owner.execute("REVOKE DELETE ON notification FROM notification_retention_runtime");try{assertThatThrownBy(()->sweep("inbox")).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThat(retired("inbox_work",id)).isFalse();assertThat(sweep("delivery")).isZero();}finally{owner.execute("GRANT DELETE ON notification TO notification_retention_runtime");}assertThat(sweep("inbox")).isEqualTo(1);assertThatThrownBy(()->jdbc.update("DELETE FROM external_job")).isInstanceOf(org.springframework.dao.DataAccessException.class);
 }
 @Test void signedReplayAfterMetadataRetirementKeepsDigestConflictCheck()throws Exception{
  UUID reference=UUID.randomUUID();String id="synthetic_"+UUID.randomUUID();byte[] key=new byte[32];var callbacks=new EmailCallbacks(owner,Clock.fixed(OLD,ZoneOffset.UTC),new DataSourceTransactionManager(source),"whsec_"+Base64.getEncoder().encodeToString(key),null,null);byte[] raw=("{\"type\":\"email.delivered\",\"created_at\":\""+OLD+"\",\"data\":{\"email_id\":\""+reference+"\"}}").getBytes(java.nio.charset.StandardCharsets.UTF_8);receive(callbacks,id,OLD,key,raw);assertThat(sweep("callback")).isEqualTo(1);String before=identity("email_callback",id);var current=new EmailCallbacks(owner,Clock.fixed(NOW,ZoneOffset.UTC),new DataSourceTransactionManager(source),"whsec_"+Base64.getEncoder().encodeToString(key),null,null);receive(current,id,NOW,key,raw);assertThat(identity("email_callback",id)).isEqualTo(before);byte[] conflict=new String(raw,java.nio.charset.StandardCharsets.UTF_8).replace("delivered","failed").getBytes(java.nio.charset.StandardCharsets.UTF_8);assertThatThrownBy(()->receive(current,id,NOW,key,conflict)).isInstanceOf(EmailCallbacks.Rejected.class);
 }
 static void receive(EmailCallbacks callbacks,String id,Instant now,byte[] key,byte[] raw)throws Exception{String timestamp=Long.toString(now.getEpochSecond());var mac=javax.crypto.Mac.getInstance("HmacSHA256");mac.init(new javax.crypto.spec.SecretKeySpec(key,"HmacSHA256"));mac.update((id+"."+timestamp+".").getBytes(java.nio.charset.StandardCharsets.US_ASCII));callbacks.receive(id,timestamp,"v1,"+Base64.getEncoder().encodeToString(mac.doFinal(raw)),raw);}
 @Test void twoWorkersRetireEachTargetOnceAndSkipActuallyLockedRows()throws Exception{
  UUID a=inbox(OLD,"PUBLISHED"),b=inbox(OLD,"EXPIRED"),held=job("FAILED",OLD,false,null),free=job("EXPIRED",OLD,false,null);String callback=callback(UUID.randomUUID(),OLD);
  try(var c=source.getConnection()){c.setAutoCommit(false);try(var q=c.prepareStatement("SELECT id FROM external_job WHERE id=? FOR UPDATE")){q.setObject(1,held);q.execute();}try(var pool=Executors.newFixedThreadPool(2)){var first=pool.submit(()->sweep("inbox")+sweep("delivery")+sweep("callback"));var second=pool.submit(()->sweep("inbox")+sweep("delivery")+sweep("callback"));assertThat(first.get(5,TimeUnit.SECONDS)+second.get(5,TimeUnit.SECONDS)).isEqualTo(4);}assertThat(retired("external_job",held)).isFalse();c.rollback();}
  assertThat(sweep("delivery")).isEqualTo(1);assertThat(retired("inbox_work",a)).isTrue();assertThat(retired("inbox_work",b)).isTrue();assertThat(retired("external_job",free)).isTrue();assertThat(retired("email_callback",callback)).isTrue();
 }
 @Test void inFlightSignedCallbackDefersCleanupThenRecentReceiptPreventsRetirement()throws Exception{
  UUID reference=UUID.randomUUID(),job=job("DELIVERED",OLD,false,reference.toString());
  try(var c=source.getConnection()){c.setAutoCommit(false);try(var q=c.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?,0))")){q.setString(1,"resend/"+reference);q.execute();}try(var pool=Executors.newSingleThreadExecutor()){assertThat(pool.submit(()->sweep("delivery")).get(5,TimeUnit.SECONDS)).isZero();}try(var q=c.prepareStatement("INSERT INTO email_callback(id,payload_hash,provider_reference,event_type,received_at) VALUES('synthetic-concurrent',repeat('b',64),?,'email.delivered',?)")){q.setObject(1,reference);q.setTimestamp(2,at(NOW));q.executeUpdate();}c.commit();}
  assertThat(sweep("delivery")).isZero();assertThat(retired("external_job",job)).isFalse();assertThat(sweep("callback")).isZero();
 }
 @Test void aggregatePreviewRunsReadOnlyWithoutExposingRecipientOrContent()throws Exception{
  UUID inbox=inbox(OLD,"PUBLISHED"),job=job("DELIVERED",OLD,false,null);String callback=callback(UUID.randomUUID(),OLD);var counts=new TreeMap<String,Long>();try(var c=jdbc.getDataSource().getConnection();var q=c.createStatement()){q.execute(Files.readString(Path.of("retention/notification-preview.sql")));do{if(q.getResultSet()!=null){var rows=q.getResultSet();assertThat(rows.getMetaData().getColumnCount()).isEqualTo(2);while(rows.next())counts.put(rows.getString("family"),rows.getLong("eligible_payloads"));}}while(q.getMoreResults()||q.getUpdateCount()!=-1);}assertThat(counts).containsExactlyInAnyOrderEntriesOf(Map.of("inbox",1L,"delivery",1L,"callback",1L));assertThat(retired("inbox_work",inbox)).isFalse();assertThat(retired("external_job",job)).isFalse();assertThat(retired("email_callback",callback)).isFalse();
 }
}
