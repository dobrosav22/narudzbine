package com.narudzbine.audit.infrastructure;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.infrastructure.database.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
@Testcontainers class EmailRedactionMigrationIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 @Test void populated76PreservesAccountsClaimsBindingsAndExecutorHistory() {
  Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261022160000").load().migrate();
  var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);
  UUID account=UUID.fromString("019a0b00-0000-7000-8000-000000000110"),tenant=UUID.fromString("019a0b00-0000-7000-8000-000000000111"),user=UUID.fromString("019a0b00-0000-7000-8000-000000000112");
  var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(ds));
  tx.executeWithoutResult(t->{
  jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'BUSINESS','synthetic-migration@example.com',true,'Synthetic','ACTIVE')",account);
   jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES(?,'BUYER','RS','RSD','Synthetic','Synthetic','SYN-UPGRADE','Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",user,account);
   jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES(?,?,'OWNER')",account,user);
  });
  jdbc.update("INSERT INTO managed_password_identity(account_id,tenant_id,provider_user_id) VALUES(?,?,?)",account,tenant,user);
  jdbc.execute("CREATE ROLE email_upgrade_executor NOLOGIN");
  jdbc.execute("INSERT INTO privacy_redaction_executor(id,revision,role_oid,environment_code,enabled,configuration_reference,created_at,updated_at) SELECT 1,1,oid,'SYNTHETIC',true,'SYN-UPGRADE',date_trunc('milliseconds',now()),date_trunc('milliseconds',now()) FROM pg_roles WHERE rolname='email_upgrade_executor'");
  var before=jdbc.queryForList("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a ORDER BY id");var claims=jdbc.queryForList("SELECT * FROM login_email_claim ORDER BY email");var bindings=jdbc.queryForList("SELECT * FROM managed_password_identity ORDER BY account_id");
  var history=jdbc.queryForList("SELECT (to_jsonb(e)-ARRAY['identity_endpoint','identity_tenant_id','identity_conformance_reference','identity_absence_allowed'])::text AS snapshot FROM privacy_redaction_executor_event e ORDER BY revision");
  MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());new DatabaseReadiness(ds).verifySchema();
  assertThat(jdbc.queryForList("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a ORDER BY id")).isEqualTo(before);assertThat(jdbc.queryForObject("SELECT count(*) FROM account_identity WHERE privacy_retired_at IS NOT NULL",Integer.class)).isZero();assertThat(jdbc.queryForList("SELECT * FROM login_email_claim ORDER BY email")).isEqualTo(claims);assertThat(jdbc.queryForList("SELECT * FROM managed_password_identity ORDER BY account_id")).isEqualTo(bindings);
  assertThat(jdbc.queryForList("SELECT (to_jsonb(e)-ARRAY['identity_endpoint','identity_tenant_id','identity_conformance_reference','identity_absence_allowed'])::text AS snapshot FROM privacy_redaction_executor_event e ORDER BY revision")).isEqualTo(history);assertThat(jdbc.queryForObject("SELECT identity_endpoint IS NULL AND identity_tenant_id IS NULL AND identity_conformance_reference IS NULL AND NOT identity_absence_allowed FROM privacy_redaction_executor",Boolean.class)).isTrue();
  assertThat(jdbc.queryForObject("SELECT count(*) FROM privacy_identity_observation",Integer.class)).isZero();
 }
}
