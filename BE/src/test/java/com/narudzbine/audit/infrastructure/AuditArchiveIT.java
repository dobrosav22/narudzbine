package com.narudzbine.audit.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers @TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AuditArchiveIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 static final Instant NOW=Instant.parse("2026-10-22T12:00:00Z");static final Clock CLOCK=Clock.fixed(NOW,ZoneOffset.UTC);static final UuidGenerator IDS=new UuidGenerator(CLOCK);
 static JdbcTemplate owner,worker;static TransactionTemplate ownerTx,workerTx;static UUID actor,policy;static ObjectsStore objects;static IndependentEvidence evidence;static UUID original;
 static class ObjectsStore implements IndependentObjects {
  final ConcurrentHashMap<Key,byte[]> values=new ConcurrentHashMap<>();volatile boolean failManifest,loseResponse;
  public boolean create(Key key,byte[] body){IndependentEvidence.outside();if(failManifest&&key.family()==Family.AUDIT_MANIFEST)throw new EvidenceFailure("EVIDENCE_STORE_UNAVAILABLE");boolean added=values.putIfAbsent(key,body.clone())==null;if(loseResponse){loseResponse=false;throw new EvidenceFailure("EVIDENCE_STORE_UNAVAILABLE");}return added;}
  public Optional<byte[]> read(Key key){IndependentEvidence.outside();return Optional.ofNullable(values.get(key)).map(byte[]::clone);}
  public Page list(Family f,int n,Key after){throw new UnsupportedOperationException();}
 }
 @BeforeAll static void setup()throws Exception {
  Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261022120000").load().migrate();
  var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());owner=new JdbcTemplate(ds);ownerTx=new TransactionTemplate(new DataSourceTransactionManager(ds));actor=IDS.next();
  ownerTx.executeWithoutResult(s->{owner.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");owner.update("INSERT INTO platform_account(id) VALUES(?)",actor);});original=event(NOW.minusSeconds(86400));
  MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
  owner.execute("CREATE ROLE archive_worker NOLOGIN");owner.execute(java.nio.file.Files.readString(java.nio.file.Path.of("audit/archive-worker-grants.sql")).replace("__WORKER_ROLE__","archive_worker"));
  var restricted=new DelegatingDataSource(ds){@Override public Connection getConnection()throws SQLException{var c=super.getConnection();try(var st=c.createStatement()){st.execute("SET ROLE archive_worker");st.execute("SET lock_timeout='2s'");}return c;}};
  worker=new JdbcTemplate(restricted);workerTx=new TransactionTemplate(new DataSourceTransactionManager(restricted));policy=IDS.next();owner.update("INSERT INTO audit_archive_policy(id,worker_role,configuration_reference,created_at,updated_at) SELECT ?,oid,'SYNTHETIC-ARCHIVE-TEST',?,? FROM pg_roles WHERE rolname='archive_worker'",policy,Timestamp.from(NOW),Timestamp.from(NOW));AuditArchiveAuthority.verify(worker,policy,"SYNTHETIC-ARCHIVE-TEST");objects=new ObjectsStore();evidence=new IndependentEvidence(objects,Map.of("v1",new byte[32]),"v1",List.of());
 }
 static UUID event(Instant at){UUID id=IDS.next();owner.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) VALUES(?,'PLATFORM_ADMIN',?,'ACCOUNT_LANGUAGE_CHANGED','ACCOUNT',?,'SUCCESS',?,?,ARRAY['languageOverride'])",id,actor,actor,IDS.next(),Timestamp.from(at));return id;}
 static AuditArchiveWorker service(){return service(evidence,CLOCK);}
 static AuditArchiveWorker service(IndependentEvidence store,Clock clock){return new AuditArchiveWorker(worker,new DataSourceTransactionManager(worker.getDataSource()),store,clock,new UuidGenerator(clock),policy);}
 static UUID runFor(UUID event){return owner.queryForObject("SELECT run_id FROM audit_archive_member WHERE event_id=?",UUID.class,event);}
 static String state(UUID run){return owner.queryForObject("SELECT state FROM audit_archive_run WHERE id=?",String.class,run);}
 static byte[] content(IndependentObjects.Family family,UUID run){return evidence.read(new IndependentObjects.Key(family,run,1)).orElseThrow().bytes();}
 @Test @Order(1) void populatedMigrationAndActualSourceProduceVerifiedPartAndManifest(){
  assertThat(owner.queryForObject("SELECT count(*) FROM audit_archive_spool WHERE event_id=?",Integer.class,original)).isEqualTo(1);assertThat(service().tick()).isEqualTo(1);UUID run=runFor(original);assertThat(state(run)).isEqualTo("VERIFIED");var mapper=JsonMapper.builder().build();var part=mapper.readTree(content(IndependentObjects.Family.AUDIT_PART,run));assertThat(part.path("events").size()).isEqualTo(1);assertThat(part.path("events").get(0).path("id").asString()).isEqualTo(original.toString());assertThat(part.path("events").get(0).path("actorId").asString()).isEqualTo(actor.toString());assertThat(part.path("eligibleBefore").asString()).isEqualTo("2026-10-22T00:00:00.000Z");var manifest=mapper.readTree(content(IndependentObjects.Family.AUDIT_MANIFEST,run));assertThat(manifest.path("dayFinal").asBoolean()).isFalse();assertThat(manifest.path("part").path("ciphertextSha256").asString()).isEqualTo(IndependentEvidence.hash(objects.values.get(new IndependentObjects.Key(IndependentObjects.Family.AUDIT_PART,run,1))));assertThat(service().tick()).isZero();assertThat(owner.queryForList("SELECT effective_role FROM audit_archive_run_event WHERE run_id=?",String.class,run)).containsExactly("archive_worker","archive_worker","archive_worker");
 }
 @Test @Order(2) void rollbackAndLateCommitNeverLoseOldDatedEvents()throws Exception{
  UUID[] rolled=new UUID[1];ownerTx.executeWithoutResult(s->{rolled[0]=event(NOW.minusSeconds(86400));s.setRollbackOnly();});assertThat(owner.queryForObject("SELECT count(*) FROM audit_archive_spool WHERE event_id=?",Integer.class,rolled[0])).isZero();
  try(var c=owner.getDataSource().getConnection()){c.setAutoCommit(false);UUID late=IDS.next();try(var st=c.prepareStatement("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) VALUES(?,'PLATFORM_ADMIN',?,'ACCOUNT_LANGUAGE_CHANGED','ACCOUNT',?,'SUCCESS',?,?,ARRAY['languageOverride'])")){st.setObject(1,late);st.setObject(2,actor);st.setObject(3,actor);st.setObject(4,IDS.next());st.setTimestamp(5,Timestamp.from(NOW.minusSeconds(172800)));st.executeUpdate();}assertThat(service().tick()).isZero();c.commit();assertThat(service().tick()).isEqualTo(1);assertThat(state(runFor(late))).isEqualTo("VERIFIED");}
 }
 @Test @Order(3) void providerResponseLossAndManifestFailureResumeSameIdentity(){
  UUID event=event(NOW.minusSeconds(86400));objects.loseResponse=true;objects.failManifest=true;assertThatThrownBy(()->service().tick()).isInstanceOf(EvidenceFailure.class);UUID run=runFor(event);assertThat(state(run)).isEqualTo("PART_VERIFIED");byte[] before=content(IndependentObjects.Family.AUDIT_PART,run);objects.failManifest=false;assertThat(service().tick()).isEqualTo(1);assertThat(state(run)).isEqualTo("VERIFIED");assertThat(content(IndependentObjects.Family.AUDIT_PART,run)).isEqualTo(before);assertThat(owner.queryForObject("SELECT count(*) FROM audit_archive_run_event WHERE run_id=?",Integer.class,run)).isEqualTo(3);
 }
 @Test @Order(4) void restrictedWorkerCannotReadRawAuditOrWriteSourceAndHelpersAreNotPublic(){
  for(String sql:List.of("SELECT * FROM audit_event","SELECT * FROM account_identity","SELECT * FROM audit_archive_policy","UPDATE audit_archive_run SET state='VERIFIED'","DELETE FROM audit_archive_member","SELECT archive_caller_role()"))assertThatThrownBy(()->worker.execute(sql)).isInstanceOf(org.springframework.dao.DataAccessException.class);
  assertThatThrownBy(()->worker.execute("CREATE TABLE forbidden(id uuid)")).isInstanceOf(org.springframework.dao.DataAccessException.class);
  for(String fn:List.of("spool_audit_event()","record_archive_run()","verify_archive_membership()","protect_archive_spool()"))assertThat(owner.queryForObject("SELECT NOT EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE p.oid=?::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')",Boolean.class,fn)).isTrue();
 }
 @Test @Order(5) void uncommittedClaimCannotReadSourceOrAcknowledgeAndReceiptReplayIsExact(){
  UUID event=event(NOW.minusSeconds(86400));UUID run=workerTx.execute(s->{UUID r=worker.queryForObject("SELECT claim_audit_archive(?,?,?)",UUID.class,policy,IDS.next(),Timestamp.from(NOW));assertThat(worker.queryForObject("SELECT count(*) FROM audit_archive_work WHERE id=?",Integer.class,r)).isZero();assertThat(worker.queryForObject("SELECT acknowledge_audit_archive(?,'PART',?,100,'v1',?)",Boolean.class,r,"a".repeat(64),Timestamp.from(NOW))).isFalse();return r;});assertThat(service().tick()).isEqualTo(1);assertThat(runFor(event)).isEqualTo(run);
  var receipt=owner.queryForMap("SELECT part_sha256,part_bytes,part_key_version FROM audit_archive_run WHERE id=?",run);assertThat(worker.queryForObject("SELECT acknowledge_audit_archive(?,'PART',?,?,?,?)",Boolean.class,run,receipt.get("part_sha256"),receipt.get("part_bytes"),receipt.get("part_key_version"),Timestamp.from(NOW))).isTrue();assertThat(worker.queryForObject("SELECT acknowledge_audit_archive(?,'PART',?,100,'v1',?)",Boolean.class,run,"b".repeat(64),Timestamp.from(NOW))).isFalse();
 }
 @Test @Order(6) void concurrentWorkersConvergeAndDisabledPolicyReconcilesPendingRun()throws Exception{
  UUID event=event(NOW.minusSeconds(86400));objects.failManifest=true;assertThatThrownBy(()->service().tick()).isInstanceOf(EvidenceFailure.class);UUID run=runFor(event);owner.update("UPDATE audit_archive_policy SET enabled=false,revision=revision+1 WHERE id=?",policy);objects.failManifest=false;
  try(var executor=Executors.newFixedThreadPool(2)){var a=executor.submit(()->service().tick());var b=executor.submit(()->service().tick());a.get(20,TimeUnit.SECONDS);b.get(20,TimeUnit.SECONDS);}assertThat(state(run)).isEqualTo("VERIFIED");assertThat(owner.queryForObject("SELECT count(*) FROM audit_archive_member WHERE event_id=?",Integer.class,event)).isEqualTo(1);assertThat(service().tick()).isZero();owner.update("UPDATE audit_archive_policy SET enabled=true,revision=revision+1 WHERE id=?",policy);
 }
 @Test @Order(7) void dailyEmptyManifestUsesUtcBoundaryAndIncludesYesterdayOnly(){
  UUID today=event(NOW);Clock tomorrow=Clock.fixed(Instant.parse("2026-10-23T00:00:00Z"),ZoneId.of("Europe/Sarajevo"));assertThat(service(evidence,tomorrow).tick()).isEqualTo(1);assertThat(state(runFor(today))).isEqualTo("VERIFIED");assertThat(service(evidence,tomorrow).tick()).isZero();Clock next=Clock.fixed(Instant.parse("2026-10-24T00:00:00Z"),ZoneId.of("Europe/Belgrade"));assertThat(service(evidence,next).tick()).isEqualTo(1);assertThat(service(evidence,next).tick()).isZero();assertThat(owner.queryForObject("SELECT record_count FROM audit_archive_run WHERE archive_date='2026-10-24'",Integer.class)).isZero();
 }
 @Test @Order(8) void boundedRunsCatchUpWithoutDuplicateOrTruncatedMembership(){
  var events=new ArrayList<UUID>();ownerTx.executeWithoutResult(s->{for(int i=0;i<251;i++)events.add(event(NOW.minusSeconds(86400)));});assertThat(service().tick()).isEqualTo(1);assertThat(service().tick()).isEqualTo(1);assertThat(service().tick()).isZero();var runs=events.stream().map(AuditArchiveIT::runFor).distinct().toList();assertThat(runs).hasSize(2);assertThat(runs.stream().map(r->owner.queryForObject("SELECT record_count FROM audit_archive_run WHERE id=?",Integer.class,r)).sorted().toList()).containsExactly(1,250);for(UUID run:runs)assertThat(state(run)).isEqualTo("VERIFIED");
 }
 @Test @Order(9) void realAcknowledgementRollbackAndLostCommitResponseConvergeOnOriginalObject(){
  for(boolean committed:List.of(false,true)){
   UUID event=event(NOW.minusSeconds(86400));var delegate=new DataSourceTransactionManager(worker.getDataSource());var commits=new java.util.concurrent.atomic.AtomicInteger();var manager=new org.springframework.transaction.PlatformTransactionManager(){
    public org.springframework.transaction.TransactionStatus getTransaction(org.springframework.transaction.TransactionDefinition d){return delegate.getTransaction(d);}
    public void rollback(org.springframework.transaction.TransactionStatus s){delegate.rollback(s);}
    public void commit(org.springframework.transaction.TransactionStatus s){if(commits.incrementAndGet()==3){if(committed)delegate.commit(s);else delegate.rollback(s);throw new org.springframework.transaction.TransactionSystemException("Synthetic response loss");}delegate.commit(s);}
   };
   var interrupted=new AuditArchiveWorker(worker,manager,evidence,CLOCK,IDS,policy);assertThatThrownBy(interrupted::tick).isInstanceOf(org.springframework.transaction.TransactionSystemException.class);UUID run=runFor(event);assertThat(state(run)).isEqualTo(committed?"PART_VERIFIED":"PENDING");var key=new IndependentObjects.Key(IndependentObjects.Family.AUDIT_PART,run,1);byte[] retained=objects.values.get(key).clone();assertThat(service().tick()).isEqualTo(1);assertThat(state(run)).isEqualTo("VERIFIED");assertThat(objects.values.get(key)).isEqualTo(retained);
  }
 }

 @Test @Order(10) void actualLocalObjectsSurviveWorkerReconstructionAndKeyRotation(@org.junit.jupiter.api.io.TempDir java.nio.file.Path directory){
  var local=new FileIndependentObjectStore(directory);var old=new IndependentEvidence(local,Map.of("v1",new byte[32]),"v1",List.of());UUID event=event(NOW.minusSeconds(86400));assertThat(service(old,CLOCK).tick()).isEqualTo(1);UUID run=runFor(event);var key=new IndependentObjects.Key(IndependentObjects.Family.AUDIT_PART,run,1);byte[] retained=local.read(key).orElseThrow();byte[] fresh=new byte[32];fresh[0]=1;var reopened=new IndependentEvidence(new FileIndependentObjectStore(directory),Map.of("v1",new byte[32],"v2",fresh),"v2",List.of());assertThat(reopened.read(key).orElseThrow().keyVersion()).isEqualTo("v1");assertThat(reopened.ensure(key,old.read(key).orElseThrow().bytes()).ciphertextSha256()).isEqualTo(IndependentEvidence.hash(retained));assertThat(service(reopened,CLOCK).tick()).isZero();
 }
 @Test @Order(99) void oversizedSourceLeavesCompleteMembershipPendingWithoutObjectOrReceipt(){
  UUID event=IDS.next();owner.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) VALUES(?,'PLATFORM_ADMIN',?,'ACCOUNT_LANGUAGE_CHANGED','ACCOUNT',?,'SUCCESS',?,?,ARRAY[repeat('x',3000000)])",event,actor,actor,IDS.next(),Timestamp.from(NOW.minusSeconds(86400)));assertThatThrownBy(()->service().tick()).isInstanceOf(EvidenceFailure.class).extracting(e->((EvidenceFailure)e).code()).isEqualTo("EVIDENCE_SIZE_LIMIT");UUID run=runFor(event);assertThat(state(run)).isEqualTo("PENDING");assertThat(objects.values).doesNotContainKey(new IndependentObjects.Key(IndependentObjects.Family.AUDIT_PART,run,1));assertThat(owner.queryForObject("SELECT count(*) FROM audit_archive_run_event WHERE run_id=?",Integer.class,run)).isEqualTo(1);
 }

 @Test @Order(11) void configuredSeparateLoginPoolRunsAgainstActualLocalFiles(@org.junit.jupiter.api.io.TempDir java.nio.file.Path directory)throws Exception{
  owner.execute("ALTER ROLE archive_worker LOGIN PASSWORD 'synthetic-local-only'");var env=new org.springframework.mock.env.MockEnvironment().withProperty("audit.archive.policy-id",policy.toString()).withProperty("audit.archive.configuration-reference","SYNTHETIC-ARCHIVE-TEST").withProperty("audit.archive.jdbc-url",DB.getJdbcUrl()).withProperty("spring.datasource.url",DB.getJdbcUrl()).withProperty("spring.datasource.username",DB.getUsername()).withProperty("audit.archive.username","archive_worker").withProperty("audit.archive.password","synthetic-local-only").withProperty("audit.archive.active-key-version","v1").withProperty("audit.archive.key-ring","{\"v1\":\""+Base64.getEncoder().encodeToString(new byte[32])+"\"}").withProperty("audit.archive.mode","LOCAL_SYNTHETIC").withProperty("audit.archive.local-root",directory.toString()).withProperty("audit.archive.local-synthetic-acknowledged","true");
  UUID event=event(NOW.minusSeconds(86400));try(var runtime=new AuditArchiveConfiguration().auditArchiveRuntime(env,CLOCK,IDS)){runtime.tick();long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);while(System.nanoTime()<deadline&&!Boolean.TRUE.equals(owner.queryForObject("SELECT EXISTS(SELECT 1 FROM audit_archive_member m JOIN audit_archive_run r ON r.id=m.run_id WHERE m.event_id=? AND r.state='VERIFIED')",Boolean.class,event)))Thread.sleep(25);assertThat(state(runFor(event))).isEqualTo("VERIFIED");}var local=new IndependentEvidence(new FileIndependentObjectStore(directory),Map.of("v1",new byte[32]),"v1",List.of());assertThat(local.read(new IndependentObjects.Key(IndependentObjects.Family.AUDIT_MANIFEST,runFor(event),1))).isPresent();
 }
 @Test @Order(12) void derivedHistoryRejectsDirectWritesAndHelperReattachment(){
  assertThatThrownBy(()->owner.update("INSERT INTO audit_archive_policy_event SELECT * FROM audit_archive_policy_event LIMIT 1")).hasStackTraceContaining("Derived archive policy event required");
  assertThatThrownBy(()->owner.update("INSERT INTO audit_archive_spool(event_id) VALUES(?)",original)).hasStackTraceContaining("Atomic original audit spool source required");
  assertThatThrownBy(()->owner.update("INSERT INTO audit_archive_run_event SELECT * FROM audit_archive_run_event LIMIT 1")).hasStackTraceContaining("Derived archive run event required");
  assertThatThrownBy(()->owner.update("DELETE FROM audit_archive_member WHERE event_id=?",original)).isInstanceOf(org.springframework.dao.DataAccessException.class);
  assertThatThrownBy(()->AuditArchiveAuthority.verify(owner,policy,"SYNTHETIC-ARCHIVE-TEST")).isInstanceOf(IllegalStateException.class);
  assertThatThrownBy(()->AuditArchiveAuthority.verify(worker,policy,"WRONG-REFERENCE")).isInstanceOf(IllegalStateException.class);
  workerTx.executeWithoutResult(s->{worker.execute("CREATE TEMP TABLE archive_spoof(id uuid)");assertThatThrownBy(()->worker.execute("CREATE TRIGGER spoof AFTER INSERT ON archive_spoof FOR EACH ROW EXECUTE FUNCTION spool_audit_event()")).hasStackTraceContaining("permission denied for function spool_audit_event");s.setRollbackOnly();});
 }

}
