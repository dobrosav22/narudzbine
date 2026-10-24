package com.narudzbine.audit.infrastructure;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import com.zaxxer.hikari.HikariDataSource;
import java.nio.file.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class RetentionHoldsIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 static final Instant NOW=Instant.parse("2026-10-22T12:00:00Z");
 HikariDataSource ownerSource,runtimeSource;JdbcTemplate owner,jdbc;TransactionTemplate tx,ownerTx;MutableClock clock;JdbcPrivateCaseReview review;PrivateReviewCleanup cleanup;UUID actor,session,organization,requester,caseId;PrivateCaseReview.Target target;PrivateCaseReview.Actor principal;
 static Timestamp at(Instant i){return Timestamp.from(i);}
 static class MutableClock extends Clock{Instant at=NOW;public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return at;}}
 @BeforeAll static void role(){new JdbcTemplate(new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword())).execute("CREATE ROLE hold_runtime LOGIN PASSWORD 'synthetic-local-only'");}
 JdbcRetentionHolds holds;com.narudzbine.shared.api.ResourceRevisions revisions;
 @BeforeEach void fixture()throws Exception{
  String database="hold_test_"+UUID.randomUUID().toString().replace("-","");new JdbcTemplate(new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword())).execute("CREATE DATABASE "+database);String url="jdbc:postgresql://"+DB.getHost()+":"+DB.getMappedPort(5432)+"/"+database;MigrationCommand.migrate(url,DB.getUsername(),DB.getPassword());
  ownerSource=pool(url,DB.getUsername(),DB.getPassword());owner=new JdbcTemplate(ownerSource);ownerTx=new TransactionTemplate(new DataSourceTransactionManager(ownerSource));
  owner.execute("GRANT USAGE ON SCHEMA public TO hold_runtime");owner.execute("GRANT SELECT ON account_identity,platform_account,application_session,application_session_identity,organization,privacy_case_metadata,audit_event TO hold_runtime");owner.execute("GRANT UPDATE(id) ON account_identity,application_session,organization TO hold_runtime");owner.execute("GRANT SELECT(id) ON privacy_case TO hold_runtime");owner.execute("GRANT INSERT ON audit_event TO hold_runtime");owner.execute(Files.readString(Path.of("audit/private-review-grants.sql")).replace("__RUNTIME_ROLE__","hold_runtime"));
  owner.execute(Files.readString(Path.of("audit/retention-holds-grants.sql")).replace("__RUNTIME_ROLE__","hold_runtime"));
  runtimeSource=pool(url,"hold_runtime","synthetic-local-only");jdbc=new JdbcTemplate(runtimeSource);tx=new TransactionTemplate(new DataSourceTransactionManager(runtimeSource));tx.setTimeout(10);clock=new MutableClock();review=new JdbcPrivateCaseReview(jdbc,clock,new UuidGenerator(clock));cleanup=new PrivateReviewCleanup(jdbc,clock);actor=UUID.randomUUID();session=UUID.randomUUID();organization=UUID.randomUUID();requester=UUID.randomUUID();caseId=UUID.randomUUID();target=new PrivateCaseReview.Target(organization,"RS");var beans=new org.springframework.beans.factory.support.StaticListableBeanFactory();revisions=new com.narudzbine.shared.api.ResourceRevisions(new byte[32]);beans.addBean("revisions",revisions);holds=new JdbcRetentionHolds(jdbc,review,clock,new UuidGenerator(clock),beans.getBeanProvider(com.narudzbine.shared.api.ResourceRevisions.class));principal=new PrivateCaseReview.Actor(actor,session,"NATIVE");
  ownerTx.executeWithoutResult(s->{owner.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN',?,true,'Synthetic operator','ACTIVE'),(?,'BUSINESS',?,true,'Synthetic requester','ACTIVE')",actor,actor+"@example.com",requester,requester+"@example.com");owner.update("INSERT INTO platform_account(id) VALUES(?)",actor);owner.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES(?,'BUYER','RS','RSD','Synthetic','Synthetic','SYN-REVIEW','Synthetic','Synthetic','11000','RS','sr-Latn-RS','ACTIVE',?)",organization,requester);owner.update("INSERT INTO business_account(id,organization_id,role) VALUES(?,?,'OWNER')",requester,organization);});
  owner.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?,'PASSWORD',0,0)",session,actor,new byte[32],at(NOW),at(NOW),at(NOW.plusSeconds(43200)),at(NOW));
  owner.update("INSERT INTO privacy_operator(account_id,created_at) VALUES(?,?)",actor,at(NOW));owner.update("INSERT INTO privacy_case(id,requester_id,organization_id,country,kind,private_reason,created_at) VALUES(?,?,?,'RS','EXPORT','Synthetic private request',?)",caseId,requester,organization,at(NOW));
 }
 static HikariDataSource pool(String url,String user,String password){var ds=new HikariDataSource();ds.setJdbcUrl(url);ds.setUsername(user);ds.setPassword(password);ds.setMaximumPoolSize(5);ds.setMinimumIdle(1);ds.setConnectionTimeout(5000);if(!user.equals("hold_runtime"))ds.setConnectionInitSql("SET narudzbine.operator_change_reference='SYN-PRIVATE-REVIEW'");return ds;}
 @AfterEach void close(){if(runtimeSource!=null)runtimeSource.close();if(ownerSource!=null)ownerSource.close();}
 void guards(){jdbc.queryForList("SELECT id FROM organization WHERE id=? FOR UPDATE",organization);jdbc.queryForList("SELECT id FROM account_identity WHERE id=? FOR UPDATE",actor);jdbc.queryForList("SELECT id FROM application_session WHERE id=? FOR UPDATE",session);}

 RetentionHolds.Context context(){return new RetentionHolds.Context("Synthetic preservation review","SYN-HOLD");}
 RetentionHolds.View activate(UUID id){return tx.execute(s->{guards();return holds.activate(principal,caseId,target,id,context());});}
 RetentionHolds.View release(RetentionHolds.View view){return tx.execute(s->{guards();return holds.release(principal,caseId,view.id(),view.revision(),context());});}
 RetentionHolds.View read(UUID id){return tx.execute(s->{guards();return holds.read(principal,caseId,id);});}
 long audits(String action){return owner.queryForObject("SELECT count(*) FROM audit_event WHERE action=?",Long.class,action);}
 boolean preserved(){return Boolean.TRUE.equals(owner.queryForObject("SELECT retention_preservation_active()",Boolean.class));}
 void refresh(){session=extraSession();principal=new PrivateCaseReview.Actor(actor,session,"NATIVE");}
 @Test void lifecyclePreservesCaseAndReplaysOriginalResults(){
  String before=owner.queryForObject("SELECT to_jsonb(c)::text FROM privacy_case c WHERE id=?",String.class,caseId);
  var first=activate(UUID.randomUUID());assertThat(first.state()).isEqualTo("ACTIVE");assertThat(preserved()).isTrue();assertThat(read(first.id())).isEqualTo(first);
  var released=release(first);assertThat(released.state()).isEqualTo("RELEASED");assertThat(preserved()).isFalse();assertThat(read(first.id())).isEqualTo(released);
  assertThat(activate(first.id())).isEqualTo(first);assertThat(release(first)).isEqualTo(released);
  assertThat(audits("RETENTION_HOLD_ACTIVATED")).isEqualTo(1);assertThat(audits("RETENTION_HOLD_RELEASED")).isEqualTo(1);
  assertThat(owner.queryForObject("SELECT to_jsonb(c)::text FROM privacy_case c WHERE id=?",String.class,caseId)).isEqualTo(before);
 }
 @Test void originalReplaySurvivesRevisionKeyRotation(){
  var first=activate(UUID.randomUUID());var released=release(first);byte[] key=new byte[32];Arrays.fill(key,(byte)1);
  var beans=new org.springframework.beans.factory.support.StaticListableBeanFactory();beans.addBean("revisions",new com.narudzbine.shared.api.ResourceRevisions(key));holds=new JdbcRetentionHolds(jdbc,review,clock,new UuidGenerator(clock),beans.getBeanProvider(com.narudzbine.shared.api.ResourceRevisions.class));
  assertThat(activate(first.id())).isEqualTo(first);assertThat(release(first)).isEqualTo(released);
 }
 @Test void replayExpiresAtSevenDaysWithoutReusingItsIdentity(){
  var first=activate(UUID.randomUUID());clock.at=NOW.plus(Duration.ofDays(7));refresh();
  assertThatThrownBy(()->activate(first.id())).isInstanceOf(PrivacyFailure.class).extracting(e->((PrivacyFailure)e).code()).isEqualTo("REPLAY_EXPIRED");assertThat(preserved()).isTrue();assertThat(audits("RETENTION_HOLD_ACTIVATED")).isEqualTo(1);
 }
 @Test void multipleHoldsComposeUntilFinalRelease(){var first=activate(UUID.randomUUID());var second=activate(UUID.randomUUID());release(first);assertThat(preserved()).isTrue();release(second);assertThat(preserved()).isFalse();}
 @Test void activationAndAuditRollBackTogether(){UUID id=UUID.randomUUID();tx.executeWithoutResult(s->{guards();holds.activate(principal,caseId,target,id,context());s.setRollbackOnly();});assertThat(preserved()).isFalse();assertThat(audits("RETENTION_HOLD_ACTIVATED")).isZero();assertThat(activate(id).state()).isEqualTo("ACTIVE");}
 @Test void releaseAndAuditRollBackTogether(){var first=activate(UUID.randomUUID());tx.executeWithoutResult(s->{guards();holds.release(principal,caseId,first.id(),first.revision(),context());s.setRollbackOnly();});assertThat(preserved()).isTrue();assertThat(audits("RETENTION_HOLD_RELEASED")).isZero();assertThat(read(first.id())).isEqualTo(first);}
 @Test void replayAndReadsRequireCurrentQualification(){var first=activate(UUID.randomUUID());owner.update("UPDATE privacy_operator SET enabled=false,revision=revision+1 WHERE account_id=?",actor);assertThatThrownBy(()->activate(first.id())).isInstanceOf(PrivacyFailure.class);assertThatThrownBy(()->read(first.id())).isInstanceOf(PrivacyFailure.class);assertThatThrownBy(()->release(first)).isInstanceOf(PrivacyFailure.class);assertThat(preserved()).isTrue();}
 @Test void freshAuthenticationBoundaryIsStrict(){var first=activate(UUID.randomUUID());clock.at=NOW.plusSeconds(300);assertThatThrownBy(()->activate(first.id())).isInstanceOf(PrivacyFailure.class);assertThatThrownBy(()->read(first.id())).isInstanceOf(PrivacyFailure.class);assertThatThrownBy(()->release(first)).isInstanceOf(PrivacyFailure.class);}
 @Test void reducedAccountAuthorityDeniesReplay(){var first=activate(UUID.randomUUID());owner.update("UPDATE account_identity SET security_epoch=security_epoch+1 WHERE id=?",actor);assertThatThrownBy(()->activate(first.id())).isInstanceOf(PrivacyFailure.class);assertThatThrownBy(()->release(first)).isInstanceOf(PrivacyFailure.class);}
 @Test void mismatchedCreationAndReleaseAreRejectedWithoutAnotherAudit(){
  var first=activate(UUID.randomUUID());assertThatThrownBy(()->tx.execute(s->{guards();return holds.activate(principal,caseId,target,first.id(),new RetentionHolds.Context("Different","SYN"));})).isInstanceOf(PrivacyFailure.class).extracting(e->((PrivacyFailure)e).code()).isEqualTo("IDEMPOTENCY_MISMATCH");
  assertThatThrownBy(()->tx.execute(s->{guards();return holds.release(principal,caseId,first.id(),"stale",context());})).isInstanceOf(PrivacyFailure.class).extracting(e->((PrivacyFailure)e).code()).isEqualTo("REVISION_MISMATCH");assertThat(audits("RETENTION_HOLD_ACTIVATED")).isEqualTo(1);assertThat(audits("RETENTION_HOLD_RELEASED")).isZero();
 }
 @Test void runtimeCannotReadPrivateReferencesOrMutateHoldEvidence(){
  var first=activate(UUID.randomUUID());assertThatThrownBy(()->jdbc.queryForList("SELECT activation_reference FROM retention_hold")).hasStackTraceContaining("permission denied");
  assertThatThrownBy(()->jdbc.update("DELETE FROM retention_hold WHERE id=?",first.id())).hasStackTraceContaining("permission denied");
  assertThatThrownBy(()->jdbc.update("UPDATE retention_hold SET state='ACTIVE',revision=2 WHERE id=?",first.id())).hasStackTraceContaining("Invalid hold release");
  assertThatThrownBy(()->jdbc.execute("TRUNCATE retention_hold CASCADE")).hasStackTraceContaining("permission denied");
 }
 @Test void coveredSessionDeletionIsBlockedButRevocationIsAllowed(){
  var first=activate(UUID.randomUUID());owner.update("UPDATE application_session SET revoked_at=? WHERE id=?",at(NOW),session);
  assertThatThrownBy(()->owner.update("DELETE FROM application_session WHERE id=?",session)).hasStackTraceContaining("RETENTION_PRESERVED");assertThat(preserved()).isTrue();
 }
 @Test void defaultOffConfigurationRequiresExplicitDrainAndNarrowPrivileges(){
  var config=new HoldsConfiguration();assertThatThrownBy(()->config.holdPrivilegeGate(jdbc,new MockEnvironment().withProperty("identity.http.enabled","true"))).isInstanceOf(IllegalStateException.class).hasMessageContaining("worker-drain");
  var env=new MockEnvironment().withProperty("identity.http.enabled","true").withProperty("audit.holds.worker-drain-reference","SYN-DRAIN");assertThat(config.holdPrivilegeGate(jdbc,env)).isNotNull();
  owner.execute("GRANT DELETE ON retention_hold TO hold_runtime");assertThatThrownBy(()->config.holdPrivilegeGate(jdbc,env)).isInstanceOf(IllegalStateException.class);
 }

 @Test void cleanupThatStartedBeforeActivationCommitsBeforeTheHold()throws Exception{
  var pool=Executors.newFixedThreadPool(2);var disposalReady=new CountDownLatch(1);var finishDisposal=new CountDownLatch(1);UUID id=UUID.randomUUID();
  try{
   var disposal=pool.submit(()->ownerTx.execute(status->{assertThat(owner.queryForObject("SELECT retention_preservation_active()",Boolean.class)).isFalse();disposalReady.countDown();await(finishDisposal);return owner.update("DELETE FROM application_session WHERE id=?",session);}));
   assertThat(disposalReady.await(5,TimeUnit.SECONDS)).isTrue();
   // Use another current session so deletion does not remove the activating operator's credential.
   UUID other=UUID.randomUUID();owner.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?,'PASSWORD',0,0)",other,actor,new byte[]{1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},at(NOW),at(NOW),at(NOW.plusSeconds(43200)),at(NOW));
   var another=new PrivateCaseReview.Actor(actor,other,"NATIVE");var activation=pool.submit(()->tx.execute(status->holds.activate(another,caseId,target,id,context())));
   waitForBarrierWaiter();assertThat(activation.isDone()).isFalse();finishDisposal.countDown();assertThat(disposal.get(5,TimeUnit.SECONDS)).isEqualTo(1);assertThat(activation.get(5,TimeUnit.SECONDS).state()).isEqualTo("ACTIVE");assertThat(preserved()).isTrue();
  }finally{finishDisposal.countDown();pool.shutdownNow();}
 }
 @Test void cleanupWaitingOnActivationSeesTheCommittedHold()throws Exception{
  var pool=Executors.newFixedThreadPool(2);var holdReady=new CountDownLatch(1);var commitHold=new CountDownLatch(1);UUID disposable=extraSession();
  try{
   var activation=pool.submit(()->tx.execute(status->{guards();var result=holds.activate(principal,caseId,target,UUID.randomUUID(),context());holdReady.countDown();await(commitHold);return result;}));
   assertThat(holdReady.await(5,TimeUnit.SECONDS)).isTrue();var disposal=pool.submit(()->owner.update("DELETE FROM application_session WHERE id=?",disposable));waitForBarrierWaiter();assertThat(disposal.isDone()).isFalse();commitHold.countDown();assertThat(activation.get(5,TimeUnit.SECONDS).state()).isEqualTo("ACTIVE");assertThatThrownBy(()->disposal.get(5,TimeUnit.SECONDS)).hasStackTraceContaining("RETENTION_PRESERVED");assertThat(preserved()).isTrue();
  }finally{commitHold.countDown();pool.shutdownNow();}
 }
 UUID extraSession(){UUID other=UUID.randomUUID();byte[] hash=new byte[32];hash[0]=2;owner.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?,'PASSWORD',0,0)",other,actor,hash,at(clock.instant()),at(clock.instant()),at(clock.instant().plusSeconds(43200)),at(clock.instant()));return other;}
 static void await(CountDownLatch latch){try{if(!latch.await(5,TimeUnit.SECONDS))throw new AssertionError("Timed out waiting for transaction coordination");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new AssertionError(e);}}
 void waitForBarrierWaiter()throws Exception{
  long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(System.nanoTime()<deadline){if(owner.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND wait_event='advisory')",Boolean.class))return;Thread.sleep(10);}throw new AssertionError("No advisory-lock waiter observed");
 }
}
