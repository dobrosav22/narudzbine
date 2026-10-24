package com.narudzbine.notifications;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.notifications.infrastructure.InboxFanout;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.*;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
@Testcontainers
class InboxMigrationIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 @Test void populatedSchema49BackfillsExactlyOnceAndPublishesMandatoryPlatformNotice(){
  Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261020140000").cleanDisabled(true).load().migrate();
  var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);var manager=new DataSourceTransactionManager(ds);var tx=new TransactionTemplate(manager);
  Clock clock=Clock.fixed(Instant.parse("2026-10-20T12:00:00Z"),ZoneOffset.UTC);var ids=new UuidGenerator(clock);UUID account=ids.next(),operation=ids.next(),notice=ids.next();Timestamp at=Timestamp.from(clock.instant());
  tx.executeWithoutResult(s->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",account,account+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",account);jdbc.update("INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,created_at,updated_at) VALUES (?,?,'RESET','COMPLETED',0,0,?,?)",operation,account,at,at);jdbc.update("INSERT INTO security_notice(id,event_key,resource_id,credential_operation_id,recipient_account_id,locale,created_at) VALUES (?,'PASSWORD_CHANGED',?,?,?,'en',?)",notice,operation,operation,account,at);jdbc.update("INSERT INTO outbox_event(id,notice_id,channel,state,created_at) VALUES (?,?,'EMAIL','QUEUED',?)",ids.next(),notice,at);});
  var before=jdbc.queryForMap("SELECT * FROM security_notice WHERE id=?",notice);var email=jdbc.queryForList("SELECT * FROM outbox_event");
  MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
  assertThat(jdbc.queryForMap("SELECT * FROM security_notice WHERE id=?",notice)).isEqualTo(before);assertThat(jdbc.queryForList("SELECT * FROM outbox_event")).isEqualTo(email);assertThat(jdbc.queryForObject("SELECT count(*) FROM inbox_work",Integer.class)).isEqualTo(1);
  assertThat(new InboxFanout(jdbc,clock,manager).publish(notice)).isTrue();assertThat(new InboxFanout(jdbc,clock,manager).publish(notice)).isFalse();assertThat(jdbc.queryForObject("SELECT text FROM notification WHERE id=?",String.class,notice)).isEqualTo("Your password changed.");new DatabaseReadiness(ds).verifySchema();
 }
}
