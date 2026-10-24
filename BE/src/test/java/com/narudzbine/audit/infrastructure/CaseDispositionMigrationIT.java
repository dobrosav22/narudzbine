package com.narudzbine.audit.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.*;
import com.narudzbine.shared.infrastructure.database.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers class CaseDispositionMigrationIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 @Test void populated77PreservesKnownIntentAclAndOriginalSuccessWithoutInventingDisposition()throws Exception{
  Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261022170000").load().migrate();
  var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);var tx=new TransactionTemplate(new DataSourceTransactionManager(ds));var clock=Clock.fixed(Instant.parse("2026-10-22T12:00:00Z"),ZoneOffset.UTC);var ids=new UuidGenerator(clock);var at=Timestamp.from(clock.instant());var json=JsonMapper.builder().build();var revisions=new ResourceRevisions(new byte[32]);
  UUID subject=ids.next(),owner=ids.next(),operator=ids.next(),org=ids.next(),session=ids.next(),source=ids.next(),plan=ids.next();
  jdbc.execute("CREATE ROLE migration_disposition_executor NOLOGIN");jdbc.execute(java.nio.file.Files.readString(java.nio.file.Path.of("audit/scoped-redaction-worker-grants.sql")).replace("__EXECUTOR_ROLE__","migration_disposition_executor"));
  tx.executeWithoutResult(t->{
   for(UUID id:List.of(subject,owner,operator))jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state,created_at,updated_at) VALUES(?,?,?,true,'PRIVATE-MIGRATION-NAME','ACTIVE',?,?)",id,id.equals(operator)?"PLATFORM_ADMIN":"BUSINESS",id+"@example.com",at,at);
   jdbc.update("INSERT INTO platform_account(id) VALUES(?)",operator);
   jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES(?,'BUYER','BA','BAM','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','BA','en','ACTIVE',?)",org,org.toString(),owner);
   jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES(?,?,'OWNER'),(?,?,'ADMIN')",owner,org,subject,org);
   jdbc.execute("SET LOCAL narudzbine.operator_change_reference='SYN-UPGRADE'");jdbc.update("INSERT INTO privacy_operator(account_id,created_at) VALUES(?,?)",operator,at);
   jdbc.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?,'PASSWORD',0,0)",session,operator,new byte[32],at,at,Timestamp.from(clock.instant().plusSeconds(43200)),at);
   jdbc.update("INSERT INTO privacy_case(id,requester_id,organization_id,country,kind,private_reason,created_at) VALUES(?,?,?,'BA','REDACTION','PRIVATE-MIGRATION-REASON',?)",source,subject,org,at);jdbc.update("UPDATE account_identity SET state='DEACTIVATED',revision=revision+1 WHERE id=?",subject);
   jdbc.update("INSERT INTO privacy_redaction_executor(id,revision,role_oid,environment_code,enabled,configuration_reference,created_at,updated_at) SELECT 1,1,oid,'SYNTHETIC',true,'SYN-UPGRADE',?,? FROM pg_roles WHERE rolname='migration_disposition_executor'",at,at);
  });
  var actor=new PrivateCaseReview.Actor(operator,session,"NATIVE");var context=new PrivateCaseReview.Context("Synthetic upgrade review","SYN-UPGRADE");var references=new ScopedRedactions.References("SYN-REQUESTER","SYN-LEGAL","SYN-CONTAINED","SYN-RETAINED");var review=new JdbcPrivateCaseReview(jdbc,clock,ids);
  var permit=tx.execute(t->review.authorize(source,new PrivateCaseReview.Target(org,"BA"),actor,context));String expected=revisions.encode("privacy/v1",source,1);var command=new ScopedRedactions.Command(plan,expected,"ACCOUNT_DISPLAY_NAME_V1",references,context);
  var original=new ScopedRedactions.View(plan,source,org,"BA","ACCOUNT_DISPLAY_NAME_V1","APPROVED",revisions.encode("redaction/v1",plan,1),"2026-10-22T12:00:00.000Z","2026-10-22T12:01:00.000Z",null,null,null,null,false);
  byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(List.of(source,plan,expected,command.scopePolicy(),references,context)));
  String prepared=tx.execute(t->jdbc.queryForObject("SELECT prepare_scoped_redaction(?,?,?,?,?,?,?,?::jsonb,?,?::jsonb,?,?,?)",String.class,plan,permit.id(),permit.nonce(),operator,session,"NATIVE",1,json.writeValueAsString(references),digest,json.writeValueAsString(original),ids.next(),ids.next(),at));assertThat(prepared).isEqualTo("OK");
  var restricted=new DelegatingDataSource(ds){@Override public Connection getConnection()throws SQLException{var c=super.getConnection();try(var q=c.createStatement()){q.execute("SET ROLE migration_disposition_executor");q.execute("SET lock_timeout='2s'");}return c;}};var executor=new JdbcTemplate(restricted);var executorTx=new TransactionTemplate(new DataSourceTransactionManager(restricted));
  var store=new Memory();var evidence=new IndependentEvidence(store,Map.of("v1",new byte[32]),"v1",List.of());byte[] intent=jdbc.queryForObject("SELECT intent_body FROM privacy_redaction_job WHERE id=?",byte[].class,plan);var receipt=evidence.ensure(new IndependentObjects.Key(IndependentObjects.Family.DELETION_INTENT,source,1),intent);
  String acknowledged=executorTx.execute(t->executor.queryForObject("SELECT acknowledge_scoped_redaction(?,?,?,?,?,?)",String.class,plan,"INTENT",receipt.ciphertextSha256(),receipt.bytes(),receipt.keyVersion(),at));assertThat(acknowledged).isEqualTo("OK");String originalJson=jdbc.queryForObject("SELECT original_response::text FROM privacy_redaction_job WHERE id=?",String.class,plan);
  MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());jdbc.execute("GRANT EXECUTE ON FUNCTION acknowledge_identity_containment(uuid,uuid,text,timestamptz,timestamptz) TO migration_disposition_executor");MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());new DatabaseReadiness(ds).verifySchema();ScopedRedactionAuthority.verify(executor);assertThat(jdbc.queryForObject("SELECT count(*) FROM privacy_case_disposition",Integer.class)).isZero();
  assertThat(jdbc.queryForObject("SELECT intent_body FROM privacy_redaction_job WHERE id=?",byte[].class,plan)).isEqualTo(intent);assertThat(jdbc.queryForObject("SELECT original_response::text FROM privacy_redaction_job WHERE id=?",String.class,plan)).isEqualTo(originalJson);
  var worker=new ScopedRedactionWorker(executor,new DataSourceTransactionManager(restricted),evidence,clock,ids,"SYNTHETIC","SYN-UPGRADE");assertThat(worker.run(plan,false).state()).isEqualTo("COMPLETED");assertThat(store.creates).isEqualTo(2);assertThat(jdbc.queryForObject("SELECT display_name FROM account_identity WHERE id=?",String.class,subject)).isEqualTo("[redacted]");
  var beans=new StaticListableBeanFactory();beans.addBean("revisions",revisions);var service=new JdbcScopedRedactions(jdbc,review,beans.getBeanProvider(ResourceRevisions.class),clock,ids);var replayPermit=tx.execute(t->review.authorize(source,new PrivateCaseReview.Target(org,"BA"),actor,context));ScopedRedactions.View replay=tx.execute(t->service.approve(replayPermit,command));assertThat(replay).isEqualTo(original);
 }
 private static class Memory implements IndependentObjects{final Map<Key,byte[]> values=new HashMap<>();int creates;public boolean create(Key k,byte[] v){IndependentEvidence.outside();creates++;return values.putIfAbsent(k,v.clone())==null;}public Optional<byte[]> read(Key k){return Optional.ofNullable(values.get(k)).map(byte[]::clone);}public Page list(Family f,int count,Key after){throw new UnsupportedOperationException();}}
}
