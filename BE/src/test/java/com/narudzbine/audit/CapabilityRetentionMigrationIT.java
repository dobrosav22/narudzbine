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
class CapabilityRetentionMigrationIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 @Test void populated65PreservesCapabilitySourcesAndMigratesExchangeIdentityWithoutClearingSecrets(){
  Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261021130000").cleanDisabled(true).load().migrate();
  var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);Instant now=Instant.parse("2026-10-21T00:00:00Z");UUID actor=UUID.randomUUID(),session=UUID.randomUUID(),op=UUID.randomUUID(),challenge=UUID.randomUUID();
  UUID reviewer=UUID.randomUUID(),business=UUID.randomUUID(),org=UUID.randomUUID(),recovery=UUID.randomUUID();
  var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(ds));tx.executeWithoutResult(t->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN','synthetic-session-migration@example.com',true,'Synthetic','ACTIVE')",actor);jdbc.update("INSERT INTO platform_account(id) VALUES(?)",actor);});
  tx.executeWithoutResult(t->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN','synthetic-capability-reviewer@example.com',true,'Synthetic','ACTIVE'),(?,'BUSINESS','synthetic-capability-owner@example.com',true,'Synthetic','ACTIVE')",reviewer,business);jdbc.update("INSERT INTO platform_account(id) VALUES(?)",reviewer);jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES(?,'BUYER','BA','BAM','Synthetic','Synthetic','SYN','Synthetic','Synthetic','71000','BA','bs-Latn-BA','ACTIVE',?)",org,business);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES(?,?,'OWNER')",business,org);});
  jdbc.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?,'PASSWORD',0,0)",session,actor,new byte[32],Timestamp.from(now),Timestamp.from(now),Timestamp.from(now.plusSeconds(43200)),Timestamp.from(now));
  jdbc.update("INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,current_session_id,created_at,updated_at) VALUES(?,?,'CHANGE','COMPLETED',0,0,?,?,?)",op,actor,session,Timestamp.from(now),Timestamp.from(now));
  jdbc.update("INSERT INTO external_challenge(id,state_hash,provider,purpose,transport,return_target,native_challenge,encrypted_verifier,account_id,original_session_id,original_token_hash,security_epoch,credential_generation,state,created_at,expires_at) VALUES(?,?,'GOOGLE','LINK','NATIVE','ANDROID',?,?,?, ?,?,0,0,'COMPLETED',?,?)",challenge,new byte[32],"a".repeat(43),new byte[71],actor,session,new byte[32],Timestamp.from(now),Timestamp.from(now.plusSeconds(300)));
  jdbc.update("INSERT INTO external_exchange(code_hash,challenge_id,account_id,issuer,subject,security_epoch,credential_generation,authenticated_at,expires_at) VALUES(?,?,?,'https://synthetic.example','synthetic-subject',0,0,?,?)",new byte[32],challenge,actor,Timestamp.from(now),Timestamp.from(now.plusSeconds(60)));
  jdbc.update("INSERT INTO recovery_case(id,creator_id,creator_epoch,reviewer_id,reviewer_epoch,organization_id,target_id,former_owner_id,target_epoch,target_generation,owner_epoch,owner_generation,kind,old_email,new_email,reason,evidence_reference,request_digest,state,token_hash,created_at,not_before,expires_at,updated_at) VALUES(?,?,0,?,0,?,?,?,0,0,0,0,'EMAIL','synthetic-capability-owner@example.com','synthetic-capability-next@example.com','Synthetic','synthetic/evidence',?,'NOTICE_PERIOD',?,?,?,?,?)",recovery,actor,reviewer,org,business,business,new byte[32],new byte[32],Timestamp.from(now),Timestamp.from(now.plusSeconds(86400)),Timestamp.from(now.plusSeconds(8*86400)),Timestamp.from(now));
  String recoveryBefore=jdbc.queryForObject("SELECT to_jsonb(r)::text FROM recovery_case r WHERE id=?",String.class,recovery);
  var before=new java.util.HashMap<String,java.util.List<java.util.Map<String,Object>>>();for(String table:java.util.List.of("application_session","credential_operation","external_challenge","external_exchange","account_identity","audit_event"))before.put(table,jdbc.queryForList("SELECT (to_jsonb(p)-'privacy_retired_at')::text AS snapshot FROM "+table+" p ORDER BY "+(table.equals("external_exchange")?"challenge_id":"id")));
  MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
  for(var e:before.entrySet())assertThat(jdbc.queryForList("SELECT (to_jsonb(p)-'privacy_retired_at')::text AS snapshot FROM "+e.getKey()+" p ORDER BY "+(e.getKey().equals("external_exchange")?"challenge_id":"id"))).isEqualTo(e.getValue());assertThat(jdbc.queryForObject("SELECT count(*) FROM application_session_identity",Integer.class)).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT account_id FROM application_session_identity WHERE id=?",UUID.class,session)).isEqualTo(actor);
  assertThat(jdbc.queryForObject("SELECT(to_jsonb(r)-'acceptance_retired')::text FROM recovery_case r WHERE id=?",String.class,recovery)).isEqualTo(recoveryBefore);assertThat(jdbc.queryForObject("SELECT NOT acceptance_retired FROM recovery_case WHERE id=?",Boolean.class,recovery)).isTrue();
  assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE indexname IN('ix_external_flow_binding_retention','ix_external_exchange_code_retention','ix_recovery_acceptance_retention')",Integer.class)).isEqualTo(3);
  assertThat(jdbc.queryForObject("SELECT a.attname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid='external_exchange'::regclass AND c.contype='p'",String.class)).isEqualTo("challenge_id");
  jdbc.update("DELETE FROM application_session WHERE id=?",session);assertThat(jdbc.queryForObject("SELECT current_session_id FROM credential_operation WHERE id=?",UUID.class,op)).isEqualTo(session);assertThat(jdbc.queryForObject("SELECT original_session_id FROM external_challenge WHERE id=?",UUID.class,challenge)).isEqualTo(session);new DatabaseReadiness(ds).verifySchema();
 }
}
