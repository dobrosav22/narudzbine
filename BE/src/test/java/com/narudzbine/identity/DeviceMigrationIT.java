package com.narudzbine.identity;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.infrastructure.database.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class DeviceMigrationIT {
    @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
    @Test void populatedSchema50PreservesActiveSessionAndInboxAndInstallsDevicesExactlyOnce() {
        Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261020150000").cleanDisabled(true).load().migrate();
        var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);var tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        UUID account=UUID.randomUUID(),session=UUID.randomUUID();Timestamp at=Timestamp.from(Instant.parse("2026-10-20T12:00:00Z"));
        tx.executeWithoutResult(s->{
            jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",account,account+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",account);
            jdbc.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES (?,?,'NATIVE',?,'Synthetic',?,?,?,?, 'PASSWORD',0,0)",session,account,new byte[32],at,at,Timestamp.from(at.toInstant().plusSeconds(43200)),at);
            jdbc.update("INSERT INTO notification_preferences(account_id) VALUES (?)",account);jdbc.update("INSERT INTO notification_preference(account_id,event_key,in_app,email,push) VALUES (?,'ORDER_SUBMITTED',true,false,true)",account);
        });
        var before=jdbc.queryForObject("SELECT to_jsonb(s)::text FROM application_session s WHERE id=?",String.class,session);var prefs=jdbc.queryForList("SELECT * FROM notification_preference");
        MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
        assertThat(jdbc.queryForObject("SELECT to_jsonb(s)::text FROM application_session s WHERE id=?",String.class,session)).isEqualTo(before);assertThat(jdbc.queryForList("SELECT * FROM notification_preference")).isEqualTo(prefs);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM push_device",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM device_registry_guard",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForMap("SELECT environment,project_id FROM device_registry_guard")).containsEntry("environment",null).containsEntry("project_id",null);new DatabaseReadiness(ds).verifySchema();
    }
}
