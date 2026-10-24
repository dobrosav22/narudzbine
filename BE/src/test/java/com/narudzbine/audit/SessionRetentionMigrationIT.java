package com.narudzbine.audit;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.infrastructure.database.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class SessionRetentionMigrationIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 @Test void inconsistentLegacyAccountBindingFailsAtomicallyInsteadOfInventingHistory(){
  var primary=new JdbcTemplate(new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()));primary.execute("CREATE DATABASE inconsistent_history");String url=DB.getJdbcUrl().replace("/"+DB.getDatabaseName(),"/inconsistent_history");
  Flyway.configure().dataSource(url,DB.getUsername(),DB.getPassword()).target("20261021120000").cleanDisabled(true).load().migrate();
  var ds=new DriverManagerDataSource(url,DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);UUID a=UUID.randomUUID(),b=UUID.randomUUID(),s=UUID.randomUUID(),op=UUID.randomUUID();var now=Timestamp.from(Instant.parse("2026-10-21T00:00:00Z"));
  new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(ds)).executeWithoutResult(t->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN','synthetic-session-a@example.com',true,'Synthetic','ACTIVE'),(?,'PLATFORM_ADMIN','synthetic-session-b@example.com',true,'Synthetic','ACTIVE')",a,b);jdbc.update("INSERT INTO platform_account(id) VALUES(?),(?)",a,b);});
  jdbc.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?::timestamptz+interval '12 hours',?,'PASSWORD',0,0)",s,a,new byte[32],now,now,now,now);
  jdbc.update("INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,current_session_id,created_at,updated_at) VALUES(?,?,'CHANGE','COMPLETED',0,0,?,?,?)",op,b,s,now,now);
  assertThatThrownBy(()->MigrationCommand.migrate(url,DB.getUsername(),DB.getPassword())).isInstanceOf(org.flywaydb.core.api.FlywayException.class);
  assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(64);assertThat(jdbc.queryForObject("SELECT to_regclass('public.application_session_identity') IS NULL",Boolean.class)).isTrue();assertThat(jdbc.queryForObject("SELECT account_id FROM credential_operation WHERE id=?",UUID.class,op)).isEqualTo(b);assertThat(jdbc.queryForObject("SELECT account_id FROM application_session WHERE id=?",UUID.class,s)).isEqualTo(a);
 }
 @Test void populated64BackfillsOnlyOriginalSessionsPreservingPayloadAndSourceReferences(){
  Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261021120000").cleanDisabled(true).load().migrate();
  var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);Instant now=Instant.parse("2026-10-21T00:00:00Z");UUID actor=UUID.randomUUID(),session=UUID.randomUUID(),op=UUID.randomUUID(),challenge=UUID.randomUUID();
  var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(ds));tx.executeWithoutResult(t->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN','synthetic-session-migration@example.com',true,'Synthetic','ACTIVE')",actor);jdbc.update("INSERT INTO platform_account(id) VALUES(?)",actor);});
  jdbc.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?,'PASSWORD',0,0)",session,actor,new byte[32],Timestamp.from(now),Timestamp.from(now),Timestamp.from(now.plusSeconds(43200)),Timestamp.from(now));
  jdbc.update("INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,current_session_id,created_at,updated_at) VALUES(?,?,'CHANGE','COMPLETED',0,0,?,?,?)",op,actor,session,Timestamp.from(now),Timestamp.from(now));
  jdbc.update("INSERT INTO external_challenge(id,state_hash,provider,purpose,transport,return_target,browser_binding_hash,encrypted_verifier,account_id,original_session_id,original_token_hash,security_epoch,credential_generation,state,created_at,expires_at) VALUES(?,?,'GOOGLE','LINK','BROWSER','WEB',?,?,?, ?,?,0,0,'COMPLETED',?,?)",challenge,new byte[32],new byte[32],new byte[71],actor,session,new byte[32],Timestamp.from(now),Timestamp.from(now.plusSeconds(300)));
  var before=new java.util.HashMap<String,java.util.List<java.util.Map<String,Object>>>();for(String table:java.util.List.of("application_session","credential_operation","external_challenge","account_identity","audit_event"))before.put(table,jdbc.queryForList("SELECT (to_jsonb(p)-'privacy_retired_at')::text AS snapshot FROM "+table+" p ORDER BY id"));
  MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
  for(var e:before.entrySet())assertThat(jdbc.queryForList("SELECT (to_jsonb(p)-'privacy_retired_at')::text AS snapshot FROM "+e.getKey()+" p ORDER BY id")).isEqualTo(e.getValue());assertThat(jdbc.queryForObject("SELECT count(*) FROM application_session_identity",Integer.class)).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT account_id FROM application_session_identity WHERE id=?",UUID.class,session)).isEqualTo(actor);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE indexname IN('ix_session_retention_absolute','ix_session_retention_idle','ix_session_retention_revoked','ix_credential_session_retention','ix_external_session_retention')",Integer.class)).isEqualTo(5);
  jdbc.update("DELETE FROM application_session WHERE id=?",session);assertThat(jdbc.queryForObject("SELECT current_session_id FROM credential_operation WHERE id=?",UUID.class,op)).isEqualTo(session);assertThat(jdbc.queryForObject("SELECT original_session_id FROM external_challenge WHERE id=?",UUID.class,challenge)).isEqualTo(session);new DatabaseReadiness(ds).verifySchema();
 }
}
