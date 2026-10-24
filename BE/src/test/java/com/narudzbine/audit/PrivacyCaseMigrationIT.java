package com.narudzbine.audit;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.*;
import java.sql.Timestamp;
import java.time.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class PrivacyCaseMigrationIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 @Test void populated57KeepsAllHistoryAndAllowsOnlyScopedClosureEvents(){
  Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261021060000").cleanDisabled(true).load().migrate();
  var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);Instant now=Instant.parse("2026-10-21T00:00:00Z");var ids=new UuidGenerator(Clock.fixed(now,ZoneOffset.UTC));var actor=ids.next();var owner=ids.next();var org=ids.next();var context=ids.next();var event=ids.next();
  new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(ds)).executeWithoutResult(s->{
   jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN','synthetic-admin-migration@example.com',true,'Synthetic administrator','ACTIVE'),(?,'BUSINESS','synthetic-owner-migration@example.com',true,'Synthetic owner','ACTIVE')",actor,owner);
   jdbc.update("INSERT INTO platform_account(id) VALUES(?)",actor);
   jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES(?,'BUYER','RS','RSD','Synthetic organization','Synthetic legal','SYN-MIGRATION','Synthetic address','Synthetic city','11000','RS','sr-Latn-RS','ACTIVE',?)",org,owner);
   jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES(?,?,'OWNER')",owner,org);
  });
  jdbc.update("INSERT INTO support_access(id,administrator_id,organization_id,country,security_epoch,credential_generation,reason,case_reference,created_at,expires_at) VALUES(?,?,?,'RS',0,0,'Synthetic investigation','SYN-MIGRATION',?,?)",context,actor,org,Timestamp.from(now),Timestamp.from(now.plusSeconds(1800)));
  jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) VALUES(?,'PLATFORM_ADMIN',?,'COMMERCIAL_SUPPORT_READ','SUPPORT_ACCESS',?,'SUCCESS',?,?,ARRAY['supportContext'])",event,actor,context,ids.next(),Timestamp.from(now));
  jdbc.update("INSERT INTO support_read_evidence(audit_id,context_id,organization_id,country,resource_type,resource_id,filters) VALUES(?,?,?,'RS','REPORT',?,'{}')",event,context,org,org);
  var audits=jdbc.queryForList("SELECT to_jsonb(a)::text AS snapshot FROM audit_event a ORDER BY id");var contexts=jdbc.queryForList("SELECT to_jsonb(s)::text FROM support_access s ORDER BY id");var reads=jdbc.queryForList("SELECT to_jsonb(s)::text FROM support_read_evidence s ORDER BY audit_id");var identities=jdbc.queryForList("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a ORDER BY id");
  MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
  assertThat(jdbc.queryForList("SELECT to_jsonb(a)::text AS snapshot FROM audit_event a ORDER BY id")).isEqualTo(audits);assertThat(jdbc.queryForList("SELECT to_jsonb(s)::text FROM support_access s ORDER BY id")).isEqualTo(contexts);assertThat(jdbc.queryForList("SELECT to_jsonb(s)::text FROM support_read_evidence s ORDER BY audit_id")).isEqualTo(reads);assertThat(jdbc.queryForList("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a ORDER BY id")).isEqualTo(identities);assertThat(jdbc.queryForObject("SELECT target_organization_id IS NULL AND target_country IS NULL FROM audit_event WHERE id=?",Boolean.class,event)).isTrue();
  assertThatThrownBy(()->jdbc.update("UPDATE audit_event SET target_organization_id=? WHERE id=?",org,event)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("append-only");
  assertThatThrownBy(()->jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,target_organization_id) VALUES(?,'PLATFORM_ADMIN',?,'ACCOUNT_LANGUAGE_CHANGED','ACCOUNT',?,'SUCCESS',?,?,ARRAY['languageOverride'],?)",ids.next(),actor,actor,ids.next(),Timestamp.from(now),org)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("ck_audit_administrative_target");
  jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,reason,target_organization_id,target_country) VALUES(?,'PLATFORM_ADMIN',?,'ADMIN_ORGANIZATION_CLOSED','ORGANIZATION',?,'SUCCESS',?,?,ARRAY['state','sessions'],'Synthetic private review',?,'RS')",ids.next(),actor,org,ids.next(),Timestamp.from(now),org);
  assertThatThrownBy(()->jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) VALUES(?,'PLATFORM_ADMIN',?,'ADMIN_ORGANIZATION_CLOSED','ORGANIZATION',?,'SUCCESS',?,?,ARRAY['state'])",ids.next(),actor,org,ids.next(),Timestamp.from(now))).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("ck_audit_action_resource");
  assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM privacy_case",Integer.class)).isZero();
  assertThat(jdbc.queryForObject("SELECT count(*) FROM privacy_case_creation",Integer.class)).isZero();
  new DatabaseReadiness(ds).verifySchema();
 }
}
