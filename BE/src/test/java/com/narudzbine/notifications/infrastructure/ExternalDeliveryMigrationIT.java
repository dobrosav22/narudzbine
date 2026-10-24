package com.narudzbine.notifications.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.notifications.api.ProviderDelivery;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class ExternalDeliveryMigrationIT {
    @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
    @Test void populatedSchema51RetainsDevicesAndIntentsAndMaterializesEmailExactlyOnce(){
        Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261020160000").cleanDisabled(true).load().migrate();
        var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);var manager=new DataSourceTransactionManager(ds);var tx=new TransactionTemplate(manager);
        Clock clock=Clock.fixed(Instant.parse("2026-10-20T12:00:00Z"),ZoneOffset.UTC);var ids=new UuidGenerator(clock);UUID account=ids.next(),session=ids.next(),device=ids.next(),operation=ids.next(),notice=ids.next();Timestamp at=Timestamp.from(clock.instant());
        tx.executeWithoutResult(s->{
            jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",account,account+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",account);
            jdbc.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES (?,?,'NATIVE',?,'Synthetic',?,?,?,?,'PASSWORD',0,0)",session,account,new byte[32],at,at,Timestamp.from(clock.instant().plusSeconds(43200)),at);
            jdbc.update("UPDATE device_registry_guard SET environment='synthetic',project_id='synthetic-project' WHERE id=1");jdbc.update("INSERT INTO push_token_claim(environment,token_hash,account_id) VALUES ('synthetic',?,?)","0".repeat(64),account);jdbc.update("INSERT INTO push_device(id,environment,installation_id,account_id,session_id,platform,token_hash,token_envelope,created_at) VALUES (?,'synthetic',?,?,?,'WEB',?,?,?)",device,UUID.randomUUID(),account,session,"0".repeat(64),new byte[32],at);
            jdbc.update("INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,created_at,updated_at) VALUES (?,?,'RESET','COMPLETED',0,0,?,?)",operation,account,at,at);jdbc.update("INSERT INTO security_notice(id,event_key,resource_id,credential_operation_id,recipient_account_id,locale,created_at) VALUES (?,'PASSWORD_CHANGED',?,?,?,'en',?)",notice,operation,operation,account,at);jdbc.update("INSERT INTO outbox_event(id,notice_id,channel,state,created_at) VALUES (?,?,'EMAIL','QUEUED',?)",ids.next(),notice,at);
        });
        String before=jdbc.queryForObject("SELECT to_jsonb(d)::text FROM push_device d WHERE id=?",String.class,device);var intents=jdbc.queryForList("SELECT * FROM outbox_event");
        MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());assertThat(jdbc.queryForObject("SELECT to_jsonb(d)::text FROM push_device d WHERE id=?",String.class,device)).isEqualTo(before);assertThat(jdbc.queryForList("SELECT * FROM outbox_event")).isEqualTo(intents);
        ProviderDelivery.Email email=(id,mail)->new ProviderDelivery.Result(ProviderDelivery.Status.ACCEPTED,UUID.randomUUID().toString(),0);
        try(var engine=new ExternalDeliveryEngine(jdbc,clock,ids,manager,email,null,null,(kind,id)->null,new byte[32],"notify@example.com","https://app.example")){
            assertThat(engine.materialize()).isEqualTo(1);assertThat(engine.materialize()).isZero();UUID job=jdbc.queryForObject("SELECT id FROM external_job",UUID.class);assertThat(engine.process(job)).isTrue();assertThat(engine.process(job)).isFalse();assertThat(jdbc.queryForObject("SELECT state FROM external_job",String.class)).isEqualTo("ACCEPTED");assertThat(jdbc.queryForObject("SELECT state FROM outbox_event",String.class)).isEqualTo("QUEUED");
        }
        new DatabaseReadiness(ds).verifySchema();
    }
}
