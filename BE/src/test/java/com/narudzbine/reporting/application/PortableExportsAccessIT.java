package com.narudzbine.reporting.application;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.narudzbine.audit.api.*;
import com.narudzbine.audit.infrastructure.JdbcPrivateCaseReview;
import com.narudzbine.reporting.api.PortableExports;
import com.narudzbine.shared.api.*;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class PortableExportsAccessIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 static JdbcTemplate jdbc;static TransactionTemplate tx;
 final Instant now=Instant.parse("2026-10-22T12:00:00Z");final Clock clock=Clock.fixed(now,ZoneOffset.UTC);final UuidGenerator ids=new UuidGenerator(clock);
 final ResourceRevisions revisions=new ResourceRevisions(new byte[32]);final byte[] key=new byte[32];
 @BeforeAll static void migrate(){MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());jdbc=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));}
 private PortableExportSettings settings(){return new PortableExportSettings(true,false,true,true,Base64.getEncoder().encodeToString(key),"");}
 private JdbcPortableExports service(Clock selected,PortableExportSettings settings){@SuppressWarnings("unchecked") ObjectProvider<ResourceRevisions> provider=mock(ObjectProvider.class);when(provider.getObject()).thenReturn(revisions);return new JdbcPortableExports(jdbc,settings,new JdbcPrivateCaseReview(jdbc,selected,new UuidGenerator(selected)),provider,selected,new UuidGenerator(selected));}
 private Fixture fixture(String country,String type){UUID org=ids.next(),owner=ids.next(),requester=ids.next(),operator=ids.next(),source=ids.next(),operatorSession=ids.next(),session=ids.next();
  tx.executeWithoutResult(s->{for(UUID account:List.of(owner,requester,operator))jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state,created_at,updated_at) VALUES(?,?,?,true,'Synthetic','ACTIVE',?,?)",account,account.equals(operator)?"PLATFORM_ADMIN":"BUSINESS",account+"@example.com",Timestamp.from(now),Timestamp.from(now));
   jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES(?,?,?,?,'Synthetic','Synthetic',?,'Synthetic','Synthetic','11000',?,'en','ACTIVE',?)",org,type,country,country.equals("RS")?"RSD":"BAM",org.toString(),country,owner);
   jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES(?,?,'OWNER'),(?,?,'ADMIN')",owner,org,requester,org);jdbc.update("INSERT INTO platform_account(id) VALUES(?)",operator);
   jdbc.execute("SET LOCAL narudzbine.operator_change_reference='SYNTHETIC-PORTABLE-TEST'");jdbc.update("INSERT INTO privacy_operator(account_id,created_at) VALUES(?,?)",operator,Timestamp.from(now));
   for(var entry:Map.of(operatorSession,operator,session,requester).entrySet())jdbc.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',sha256(convert_to(?,'UTF8')),'Synthetic',?,?,?,?,'PASSWORD',0,0)",entry.getKey(),entry.getValue(),entry.getKey().toString(),Timestamp.from(now),Timestamp.from(now),Timestamp.from(now.plusSeconds(172800)),Timestamp.from(now));
   jdbc.update("INSERT INTO privacy_case(id,requester_id,organization_id,country,kind,private_reason,created_at) VALUES(?,?,?,?,'EXPORT','Synthetic private request',?)",source,requester,org,country,Timestamp.from(now));
  });return new Fixture(source,org,requester,owner,new PrivateCaseReview.Actor(operator,operatorSession,"NATIVE"),new PortableExports.Scope(requester,session,"NATIVE",org,country));
 }
 private PortableExports.View approve(Fixture f,JdbcPortableExports service){return tx.execute(s->service.approve(f.operator(),f.source(),ids.next(),revisions.encode("privacy/v1",f.source(),1),new PortableExports.Context("Synthetic approval","SYNTHETIC")));}
 private void ready(UUID id,byte[] plain){jdbc.update("UPDATE privacy_export_job SET state='READY',revision=2,updated_at=?,completed_at=?,expires_at=?,artifact=?,digest=sha256(?::bytea),byte_count=?,record_count=1 WHERE id=?",Timestamp.from(now),Timestamp.from(now),Timestamp.from(now.plusSeconds(86400)),new SecretEnvelope(key,"privacy-json/v1").encrypt(id,plain),plain,plain.length,id);}
 @Test void bothCountriesAndOrganizationTypesCommitDisclosuresAndReauthorizeRetries(){for(String country:List.of("RS","BA"))for(String type:List.of("BUYER","VENDOR")){var f=fixture(country,type);var service=service(clock,settings());var queued=approve(f,service);byte[] plain="{\"synthetic\":true}".getBytes(java.nio.charset.StandardCharsets.UTF_8);ready(queued.id(),plain);
  assertThat(tx.execute(s->service.status(f.scope(),f.source(),null)).state()).isEqualTo("READY");assertThat(tx.execute(s->service.content(f.scope(),f.source(),queued.id())).bytes()).isEqualTo(plain);
  assertThat(jdbc.queryForObject("SELECT state FROM privacy_fulfillment_metadata WHERE case_id=?",String.class,f.source())).isEqualTo("COMPLETED");assertThat(tx.execute(s->service.content(f.scope(),f.source(),queued.id())).bytes()).isEqualTo(plain);
  assertThat(jdbc.queryForObject("SELECT revision FROM privacy_export_job WHERE id=?",Long.class,queued.id())).isEqualTo(3);assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE resource_id=? AND action='PRIVACY_EXPORT_DOWNLOADED'",Integer.class,queued.id())).isEqualTo(2);
  jdbc.update("UPDATE business_account SET role='STAFF' WHERE id=?",f.requester());assertThatThrownBy(()->tx.execute(s->service.content(f.scope(),f.source(),queued.id()))).isInstanceOf(PrivacyFailure.class);
 }}
 @Test void replayIsOriginalAndBoundToApprovalContext(){var f=fixture("RS","BUYER");var service=service(clock,settings());var queued=approve(f,service);ready(queued.id(),new byte[]{123,125});assertThat(tx.<PortableExports.View>execute(s->service.approve(f.operator(),f.source(),queued.id(),revisions.encode("privacy/v1",f.source(),1),new PortableExports.Context("Synthetic approval","SYNTHETIC")))).isEqualTo(queued);
  assertThatThrownBy(()->tx.execute(s->service.approve(f.operator(),f.source(),queued.id(),revisions.encode("privacy/v1",f.source(),1),new PortableExports.Context("Changed","SYNTHETIC")))).isInstanceOf(PrivacyFailure.class).extracting(e->((PrivacyFailure)e).code()).isEqualTo("IDEMPOTENCY_MISMATCH");
 }
 @Test void wrongKeyRollsBackAuditAndFirstDisclosure(){var f=fixture("BA","VENDOR");var service=service(clock,settings());var queued=approve(f,service);ready(queued.id(),new byte[]{123,125});byte[] wrong=new byte[32];wrong[0]=1;var bad=service(clock,new PortableExportSettings(true,false,true,true,Base64.getEncoder().encodeToString(wrong),""));assertThatThrownBy(()->tx.execute(s->bad.content(f.scope(),f.source(),queued.id()))).isInstanceOf(PrivacyFailure.class);assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE resource_id=? AND action='PRIVACY_EXPORT_DOWNLOADED'",Integer.class,queued.id())).isZero();assertThat(jdbc.queryForObject("SELECT state FROM privacy_fulfillment_metadata WHERE case_id=?",String.class,f.source())).isEqualTo("READY");}
 @Test void metadataExpiresWhenActionFlagIsOffAndNeverRevertsCompletedCase(){var f=fixture("RS","BUYER");var service=service(clock,settings());var queued=approve(f,service);ready(queued.id(),new byte[]{123,125});var later=Clock.fixed(now.plusSeconds(86400),ZoneOffset.UTC);var projection=new JdbcPrivacyFulfillment(jdbc,later);assertThat(tx.execute(s->projection.current(f.source()).orElseThrow()).state()).isEqualTo("REVIEWING");assertThat(jdbc.queryForObject("SELECT artifact IS NULL FROM privacy_export_job WHERE id=?",Boolean.class,queued.id())).isTrue();long revision=tx.execute(s->projection.current(f.source()).orElseThrow()).revision();assertThat(tx.execute(s->projection.current(f.source()).orElseThrow()).revision()).isEqualTo(revision);}
 @Test void counterpartAndDifferentSameOrganizationAccountCannotRead(){var f=fixture("BA","BUYER");var service=service(clock,settings());var queued=approve(f,service);ready(queued.id(),new byte[]{123,125});var other=new PortableExports.Scope(f.owner(),f.scope().session(),"NATIVE",f.org(),"BA");assertThatThrownBy(()->tx.execute(s->service.status(other,f.source(),queued.id()))).isInstanceOf(PrivacyFailure.class);var foreign=fixture("BA","BUYER");assertThatThrownBy(()->tx.execute(s->service.content(foreign.scope(),f.source(),queued.id()))).isInstanceOf(PrivacyFailure.class);}
 @Test void publicHasNoFunctionExecutionOrPrivateTableGrants(){for(String function:List.of("expire_privacy_exports(uuid,timestamptz)","owned_privacy_export(uuid,uuid,uuid,uuid,text,uuid,text,timestamptz)","disclose_privacy_export(uuid,uuid,uuid,uuid,text,uuid,text,timestamptz,uuid,uuid)"))assertThat(jdbc.queryForObject("SELECT NOT EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE p.oid=?::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')",Boolean.class,function)).isTrue();}
 private JdbcTemplate workerJdbc()throws Exception{
  if(!jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='portable_worker')",Boolean.class)){
   jdbc.execute("CREATE ROLE portable_worker NOLOGIN");jdbc.execute("GRANT USAGE ON SCHEMA public TO portable_worker");
   jdbc.execute(java.nio.file.Files.readString(java.nio.file.Path.of("privacy/portable-json-worker-grants.sql")).replace("__WORKER_ROLE__","portable_worker"));
  }
  var base=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
  var restricted=new org.springframework.jdbc.datasource.DelegatingDataSource(base){@Override public java.sql.Connection getConnection()throws java.sql.SQLException{var connection=super.getConnection();try(var statement=connection.createStatement()){statement.execute("SET ROLE portable_worker");statement.execute("SET lock_timeout='2s'");}return connection;}};
  var result=new JdbcTemplate(restricted);com.narudzbine.reporting.infrastructure.PortableWorkerAuthority.verify(result);return result;
 }
 @Test void restrictedWorkerGeneratesCompleteManifestsForBothCountriesAndTypes()throws Exception{
  var restricted=workerJdbc();var workerSettings=new PortableExportSettings(true,true,true,true,Base64.getEncoder().encodeToString(key),"");
  var worker=new PortableExportWorker(restricted,new DataSourceTransactionManager(restricted.getDataSource()),workerSettings,clock);
  for(String country:List.of("RS","BA"))for(String type:List.of("BUYER","VENDOR")){
   var f=fixture(country,type);var service=service(clock,settings());var queued=approve(f,service);
   for(int i=0;i<30&&!jdbc.queryForObject("SELECT state FROM privacy_export_job WHERE id=?",String.class,queued.id()).equals("READY");i++)worker.tick();
   assertThat(jdbc.queryForObject("SELECT state FROM privacy_export_job WHERE id=?",String.class,queued.id())).isEqualTo("READY");
   var content=tx.execute(status->service.content(f.scope(),f.source(),queued.id()));var tree=tools.jackson.databind.json.JsonMapper.builder().build().readTree(content.bytes());
   assertThat(tree.path("manifest").path("country").asString()).isEqualTo(country);assertThat(tree.path("manifest").path("organizationType").asString()).isEqualTo(type);
   var data=tree.path("data");assertThat(data.size()).isEqualTo(PortableJson.Family.values().length);assertThat(data.path("requester").size()).isEqualTo(1);assertThat(data.path("organization").size()).isEqualTo(1);assertThat(data.path("members").size()).isEqualTo(2);assertThat(data.path("preferences").size()).isEqualTo(6);
   assertThat(new String(content.bytes(),java.nio.charset.StandardCharsets.UTF_8)).doesNotContain("token_hash","security_epoch","credential_generation","Synthetic private request","Synthetic approval","SYNTHETIC");
  }
  assertThatThrownBy(()->restricted.queryForList("SELECT artifact FROM privacy_export_job")).isInstanceOf(org.springframework.dao.DataAccessException.class);
  assertThatThrownBy(()->restricted.queryForList("SELECT * FROM privacy_case")).isInstanceOf(org.springframework.dao.DataAccessException.class);
  assertThatThrownBy(()->restricted.queryForList("SELECT * FROM account_identity")).isInstanceOf(org.springframework.dao.DataAccessException.class);
  assertThatThrownBy(()->restricted.update("UPDATE organization SET display_name='No'" )).isInstanceOf(org.springframework.dao.DataAccessException.class);
  assertThatThrownBy(()->com.narudzbine.reporting.infrastructure.PortableWorkerAuthority.verify(jdbc)).isInstanceOf(IllegalStateException.class);
 }
 private UUID seedProduct(Fixture f){UUID unit=ids.next(),product=ids.next();tx.executeWithoutResult(s->{
  jdbc.update("INSERT INTO organization_plan(organization_id,plan_revision_id) SELECT ?,id FROM plan_revision WHERE code='STARTER' AND revision=1",f.org());
  jdbc.update("INSERT INTO catalogue_taxonomy(id,vendor_id,kind,name,normalized_name,created_at,updated_at) VALUES(?,?,'UNIT','kg','kg',?,?)",unit,f.org(),Timestamp.from(now),Timestamp.from(now));
  jdbc.update("INSERT INTO catalogue_product_identity(id,vendor_id,unit_id) VALUES(?,?,?)",product,f.org(),unit);
  jdbc.update("INSERT INTO catalogue_product(id,vendor_id,sku,normalized_sku,name,normalized_name,description,minimum_quantity,quantity_step,created_at,updated_at) VALUES(?,?,'SYN-1','syn-1','Čaj 🍵','čaj','Synthetic catalogue description',1,1,?,?)",product,f.org(),Timestamp.from(now),Timestamp.from(now));
  jdbc.update("INSERT INTO product_sku_reservation(vendor_id,normalized_sku,product_id) VALUES(?,'syn-1',?)",f.org(),product);
  jdbc.update("UPDATE product_pricing SET base_price=13.50,revision=2 WHERE product_id=?",product);
  jdbc.update("INSERT INTO product_volume_tier(product_id,minimum_quantity,unit_price) VALUES(?,5,12.25)",product);
  jdbc.update("INSERT INTO product_pricing_history(product_id,revision,actor_id,base_price,tiers,occurred_at) VALUES(?,2,?,13.50,'[{\"minimumQuantity\":5,\"unitPrice\":12.25}]',?)",product,f.requester(),Timestamp.from(now));
  jdbc.update("UPDATE stock_balance SET available_count=10,confirmed_epoch=1,revision=2 WHERE product_id=?",product);
  jdbc.update("INSERT INTO stock_event(id,vendor_id,product_id,type,before_count,after_count,delta,actor_id,created_at) VALUES(?,?,?,'INITIALIZED',NULL,10,10,?,?)",ids.next(),f.org(),product,f.requester(),Timestamp.from(now));
 });return product;}
 @Test void populatedVendorProjectionPreservesStringPricesUnicodeHistoryAndVendorScope()throws Exception{
  var restricted=workerJdbc();var f=fixture("RS","VENDOR");UUID product=seedProduct(f);var other=fixture("RS","VENDOR");UUID foreign=seedProduct(other);
  var service=service(clock,settings());var queued=approve(f,service);var worker=new PortableExportWorker(restricted,new DataSourceTransactionManager(restricted.getDataSource()),new PortableExportSettings(true,true,true,true,Base64.getEncoder().encodeToString(key),""),clock);
  for(int i=0;i<30&&!jdbc.queryForObject("SELECT state FROM privacy_export_job WHERE id=?",String.class,queued.id()).equals("READY");i++)worker.tick();
  var content=tx.execute(s->service.content(f.scope(),f.source(),queued.id()));var tree=tools.jackson.databind.json.JsonMapper.builder().build().readTree(content.bytes()).path("data");
  assertThat(tree.path("products").size()).isEqualTo(1);assertThat(tree.path("products").get(0).path("id").asString()).isEqualTo(product.toString());assertThat(tree.path("products").get(0).path("name").asString()).isEqualTo("Čaj 🍵");
  assertThat(tree.path("pricing").get(0).path("basePrice").asString()).isEqualTo("13.50");assertThat(tree.path("pricing").get(0).path("tiers").get(0).path("unitPrice").asString()).isEqualTo("12.25");assertThat(tree.path("pricingHistory").size()).isEqualTo(1);assertThat(tree.path("skuReservations").size()).isEqualTo(1);assertThat(tree.path("taxonomy").size()).isEqualTo(1);assertThat(tree.path("inventory").get(0).path("availableCount").asInt()).isEqualTo(10);assertThat(tree.path("stockHistory").size()).isEqualTo(1);assertThat(tree.path("tracking").size()).isEqualTo(1);assertThat(tree.path("plan").get(0).path("code").asString()).isEqualTo("STARTER");assertThat(tree.toString()).doesNotContain(foreign.toString(),other.org().toString(),other.requester().toString());
 }
 @Test void heldCiphertextExpiresWithoutDisclosureAndOnlyRetiresAfterRelease()throws Exception{
  var f=fixture("BA","VENDOR");var service=service(clock,settings());var queued=approve(f,service);ready(queued.id(),new byte[]{123,125});
  @SuppressWarnings("unchecked") ObjectProvider<ResourceRevisions> provider=mock(ObjectProvider.class);when(provider.getObject()).thenReturn(revisions);
  var holds=new com.narudzbine.audit.infrastructure.JdbcRetentionHolds(jdbc,new JdbcPrivateCaseReview(jdbc,clock,ids),clock,ids,provider);
  UUID hold=ids.next();var held=tx.execute(s->holds.activate(f.operator(),f.source(),new PrivateCaseReview.Target(f.org(),"BA"),hold,new RetentionHolds.Context("Synthetic hold","SYN-HOLD")));
  try{
   var later=Clock.fixed(now.plusSeconds(86400),ZoneOffset.UTC);var projection=new JdbcPrivacyFulfillment(jdbc,later);assertThat(tx.execute(s->projection.current(f.source()).orElseThrow()).state()).isEqualTo("REVIEWING");
   assertThat(jdbc.queryForObject("SELECT artifact_held AND artifact IS NOT NULL FROM privacy_export_job WHERE id=?",Boolean.class,queued.id())).isTrue();
   tx.executeWithoutResult(s->jdbc.queryForObject("SELECT sweep_privacy_exports(?)",Integer.class,Timestamp.from(later.instant())));assertThat(jdbc.queryForObject("SELECT artifact IS NOT NULL FROM privacy_export_job WHERE id=?",Boolean.class,queued.id())).isTrue();
  }finally{tx.executeWithoutResult(s->holds.release(f.operator(),f.source(),hold,held.revision(),new RetentionHolds.Context("Synthetic release","SYN-RELEASE")));}
  tx.executeWithoutResult(s->jdbc.queryForObject("SELECT sweep_privacy_exports(?)",Integer.class,Timestamp.from(now.plusSeconds(86400))));assertThat(jdbc.queryForObject("SELECT artifact IS NULL AND NOT artifact_held FROM privacy_export_job WHERE id=?",Boolean.class,queued.id())).isTrue();
 }
 private PortableExportWorker worker(JdbcTemplate restricted){return new PortableExportWorker(restricted,new DataSourceTransactionManager(restricted.getDataSource()),new PortableExportSettings(true,true,true,true,Base64.getEncoder().encodeToString(key),""),clock);}
 private void drain(PortableExportWorker worker){for(int i=0;i<50&&worker.tick()!=0;i++){} }
 @Test void failedGenerationCanBeExplicitlyReapprovedAndLatestUsesGenerationOrder(){
  var f=fixture("RS","BUYER");var service=service(clock,settings());var first=approve(f,service);jdbc.queryForObject("SELECT fail_privacy_export(?,'SERVICE_UNAVAILABLE',?)",Integer.class,first.id(),Timestamp.from(now));
  long revision=jdbc.queryForObject("SELECT revision FROM privacy_fulfillment_metadata WHERE case_id=?",Long.class,f.source());UUID next=new UUID(0x7000L,0x8000000000000000L|java.util.concurrent.ThreadLocalRandom.current().nextLong(0x3fffffffffffffffL));
  var second=tx.execute(s->service.approve(f.operator(),f.source(),next,revisions.encode("privacy/v1",f.source(),revision),new PortableExports.Context("Synthetic second approval","SYN-SECOND")));
  assertThat(tx.execute(s->service.administrative(f.operator(),f.source(),null)).id()).isEqualTo(second.id());
  assertThatThrownBy(()->tx.execute(s->service.approve(f.operator(),f.source(),ids.next(),revisions.encode("privacy/v1",f.source(),1),new PortableExports.Context("Synthetic approval","SYNTHETIC")))).isInstanceOf(PrivacyFailure.class).extracting(e->((PrivacyFailure)e).code()).isEqualTo("REVISION_CONFLICT");
 }
 @Test void missingSourceGrantFailsWholeGenerationWithoutPartialArtifact()throws Exception{
  var restricted=workerJdbc();var worker=worker(restricted);drain(worker);var f=fixture("BA","BUYER");var queued=approve(f,service(clock,settings()));jdbc.execute("REVOKE SELECT ON privacy_source_contacts FROM portable_worker");
  try{assertThat(worker.tick()).isEqualTo(1);}finally{jdbc.execute("GRANT SELECT ON privacy_source_contacts TO portable_worker");}
  assertThat(jdbc.queryForObject("SELECT state FROM privacy_export_job WHERE id=?",String.class,queued.id())).isEqualTo("FAILED");assertThat(jdbc.queryForObject("SELECT failure_code FROM privacy_export_job WHERE id=?",String.class,queued.id())).isEqualTo("SERVICE_UNAVAILABLE");assertThat(jdbc.queryForObject("SELECT artifact IS NULL FROM privacy_export_job WHERE id=?",Boolean.class,queued.id())).isTrue();
 }
 @Test void workerWaitsForCommittingRoleReductionAndDoesNotPublish()throws Exception{
  var restricted=workerJdbc();var worker=worker(restricted);drain(worker);var f=fixture("RS","BUYER");var queued=approve(f,service(clock,settings()));
  try(var connection=java.sql.DriverManager.getConnection(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword())){
   connection.setAutoCommit(false);int pid;try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT pg_backend_pid()")){rows.next();pid=rows.getInt(1);}
   try(var q=connection.prepareStatement("SELECT id FROM organization WHERE id=? FOR UPDATE")){q.setObject(1,f.org());q.execute();}
   var pending=java.util.concurrent.CompletableFuture.supplyAsync(worker::tick);long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(5);boolean blocked=false;
   while(System.nanoTime()<deadline){blocked=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)))",Boolean.class,pid);if(blocked)break;Thread.sleep(10);}
   assertThat(blocked).as("worker waits for the actual committing organization guard").isTrue();try(var q=connection.prepareStatement("UPDATE business_account SET role='STAFF' WHERE id=?")){q.setObject(1,f.requester());q.execute();}connection.commit();assertThat(pending.get(10,java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(1);
  }
  assertThat(jdbc.queryForObject("SELECT state FROM privacy_export_job WHERE id=?",String.class,queued.id())).isEqualTo("FAILED");assertThat(jdbc.queryForObject("SELECT failure_code FROM privacy_export_job WHERE id=?",String.class,queued.id())).isEqualTo("ACCESS_REVOKED");assertThat(jdbc.queryForObject("SELECT artifact IS NULL FROM privacy_export_job WHERE id=?",Boolean.class,queued.id())).isTrue();
 }
 @Test void globalRowBoundFailsGenerationRatherThanPublishingATruncatedFamily()throws Exception{
  var restricted=workerJdbc();var worker=worker(restricted);drain(worker);var f=fixture("BA","BUYER");var queued=approve(f,service(clock,settings()));String original=jdbc.queryForObject("SELECT pg_get_viewdef('privacy_source_favorites'::regclass,true)",String.class).strip().replaceAll(";+$","");
  jdbc.execute("CREATE OR REPLACE VIEW privacy_source_favorites AS "+original+" UNION ALL SELECT j.job_id,j.organization_id,j.organization_id,j.snapshot_at::timestamptz(3) FROM privacy_source_scope j CROSS JOIN generate_series(1,100001) g WHERE j.job_id='"+queued.id()+"'::uuid");
  try{assertThat(worker.tick()).isEqualTo(1);}finally{jdbc.execute("CREATE OR REPLACE VIEW privacy_source_favorites AS "+original);}
  assertThat(jdbc.queryForObject("SELECT state FROM privacy_export_job WHERE id=?",String.class,queued.id())).isEqualTo("FAILED");assertThat(jdbc.queryForObject("SELECT failure_code FROM privacy_export_job WHERE id=?",String.class,queued.id())).isEqualTo("PRIVACY_EXPORT_ROW_LIMIT");assertThat(jdbc.queryForObject("SELECT artifact IS NULL FROM privacy_export_job WHERE id=?",Boolean.class,queued.id())).isTrue();
 }
 @Test void byteBoundFailsLargeUnicodeFamilyBeforeAnyArtifactIsPublished()throws Exception{
  var restricted=workerJdbc();var worker=worker(restricted);drain(worker);var f=fixture("RS","VENDOR");var queued=approve(f,service(clock,settings()));String original=jdbc.queryForObject("SELECT pg_get_viewdef('privacy_source_taxonomy'::regclass,true)",String.class).strip().replaceAll(";+$","");
  jdbc.execute("CREATE OR REPLACE VIEW privacy_source_taxonomy AS "+original+" UNION ALL SELECT j.job_id,j.organization_id,1::bigint,'UNIT'::varchar(8),repeat('🍵',100)::varchar(100),false,false,j.snapshot_at::timestamptz(3),j.snapshot_at::timestamptz(3) FROM privacy_source_scope j CROSS JOIN generate_series(1,40000) g WHERE j.job_id='"+queued.id()+"'::uuid");
  try{assertThat(worker.tick()).isEqualTo(1);}finally{jdbc.execute("CREATE OR REPLACE VIEW privacy_source_taxonomy AS "+original);}
  assertThat(jdbc.queryForObject("SELECT failure_code FROM privacy_export_job WHERE id=?",String.class,queued.id())).isEqualTo("PRIVACY_EXPORT_SIZE_LIMIT");assertThat(jdbc.queryForObject("SELECT state='FAILED' AND artifact IS NULL FROM privacy_export_job WHERE id=?",Boolean.class,queued.id())).isTrue();
 }
 @Test void actualSnapshotTimeoutFailsWithoutPublishingPartialContent()throws Exception{
  var restricted=workerJdbc();var worker=worker(restricted);drain(worker);var f=fixture("BA","BUYER");var queued=approve(f,service(clock,settings()));String original=jdbc.queryForObject("SELECT pg_get_viewdef('privacy_source_favorites'::regclass,true)",String.class).strip().replaceAll(";+$","");
  jdbc.execute("CREATE OR REPLACE VIEW privacy_source_favorites AS "+original+" UNION ALL SELECT j.job_id,j.organization_id,j.organization_id,(j.snapshot_at+(SELECT 0 FROM pg_sleep(30))*interval '1 second')::timestamptz(3) FROM privacy_source_scope j WHERE j.job_id='"+queued.id()+"'::uuid");
  long before=System.nanoTime();try{assertThat(worker.tick()).isEqualTo(1);}finally{jdbc.execute("CREATE OR REPLACE VIEW privacy_source_favorites AS "+original);}
  assertThat(java.util.concurrent.TimeUnit.NANOSECONDS.toSeconds(System.nanoTime()-before)).isLessThan(30);assertThat(jdbc.queryForObject("SELECT failure_code FROM privacy_export_job WHERE id=?",String.class,queued.id())).isEqualTo("SERVICE_UNAVAILABLE");assertThat(jdbc.queryForObject("SELECT state='FAILED' AND artifact IS NULL FROM privacy_export_job WHERE id=?",Boolean.class,queued.id())).isTrue();
 }
 @Test void heldExpiredCiphertextsStillConsumeTheStorageBudget()throws Exception{
  var restricted=workerJdbc();var worker=worker(restricted);drain(worker);var f=fixture("RS","VENDOR");var service=service(clock,settings());var filled=new ArrayList<UUID>();
  @SuppressWarnings("unchecked") ObjectProvider<ResourceRevisions> provider=mock(ObjectProvider.class);when(provider.getObject()).thenReturn(revisions);var holds=new com.narudzbine.audit.infrastructure.JdbcRetentionHolds(jdbc,new JdbcPrivateCaseReview(jdbc,clock,ids),clock,ids,provider);
  var first=approve(f,service);filled.add(f.source());UUID hold=ids.next();var held=tx.execute(s->holds.activate(f.operator(),f.source(),new PrivateCaseReview.Target(f.org(),"RS"),hold,new RetentionHolds.Context("Synthetic capacity hold","SYN-CAPACITY")));
  try{
   for(int i=0;i<8;i++){
    UUID job;if(i==0)job=first.id();else{UUID source=ids.next();jdbc.update("INSERT INTO privacy_case(id,requester_id,organization_id,country,kind,private_reason,created_at) VALUES(?,?,?,'RS','EXPORT','Synthetic capacity fixture',?)",source,f.requester(),f.org(),Timestamp.from(now));filled.add(source);job=tx.execute(s->service.approve(f.operator(),source,ids.next(),revisions.encode("privacy/v1",source,1),new PortableExports.Context("Synthetic capacity approval","SYN-CAPACITY"))).id();}
    // Synthetic schema-valid ciphertext fills the byte budget; it is deliberately never downloaded.
    jdbc.update("UPDATE privacy_export_job SET state='READY',revision=2,updated_at=?,completed_at=?,expires_at=?,artifact=decode(repeat('ab',16777216),'hex'),digest=decode(repeat('cd',32),'hex'),byte_count=16777188,record_count=0 WHERE id=?",Timestamp.from(now),Timestamp.from(now),Timestamp.from(now.plusSeconds(86400)),job);
   }
   for(UUID source:filled)tx.executeWithoutResult(s->jdbc.queryForObject("SELECT expire_privacy_exports(?,?)",Integer.class,source,Timestamp.from(now.plusSeconds(86400))));
   assertThat(jdbc.queryForObject("SELECT sum(octet_length(artifact)::bigint) FROM privacy_export_job WHERE artifact_held",Long.class)).isGreaterThanOrEqualTo(PortableExportSettings.STORAGE_BYTES);
   var next=fixture("BA","BUYER");var queued=approve(next,service);assertThat(worker.tick()).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT failure_code FROM privacy_export_job WHERE id=?",String.class,queued.id())).isEqualTo("PRIVACY_EXPORT_CAPACITY_REACHED");assertThat(jdbc.queryForObject("SELECT artifact IS NULL FROM privacy_export_job WHERE id=?",Boolean.class,queued.id())).isTrue();
  }finally{tx.executeWithoutResult(s->holds.release(f.operator(),f.source(),hold,held.revision(),new RetentionHolds.Context("Synthetic capacity release","SYN-CAPACITY")));tx.executeWithoutResult(s->jdbc.queryForObject("SELECT sweep_privacy_exports(?)",Integer.class,Timestamp.from(now)));}
 }
 private record Fixture(UUID source,UUID org,UUID requester,UUID owner,PrivateCaseReview.Actor operator,PortableExports.Scope scope){}
}
