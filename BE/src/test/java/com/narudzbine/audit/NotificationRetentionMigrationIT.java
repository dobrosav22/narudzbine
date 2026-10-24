package com.narudzbine.audit;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.infrastructure.database.*;
import java.sql.Timestamp;
import java.time.Instant;
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
class NotificationRetentionMigrationIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 @Test void populated66RepeatedMigrationPreservesAllContentAndAddsOnlyFalseMarkers(){
  Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261021140000").cleanDisabled(true).load().migrate();var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);var tx=new TransactionTemplate(new DataSourceTransactionManager(ds));Timestamp now=Timestamp.from(Instant.parse("2026-07-01T12:00:00Z"));UUID account=UUID.randomUUID(),operation=UUID.randomUUID(),notice=UUID.randomUUID(),source=UUID.randomUUID(),job=UUID.randomUUID(),reference=UUID.randomUUID();
  tx.executeWithoutResult(s->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN','synthetic-notification-migration@example.com',true,'Synthetic','ACTIVE')",account);jdbc.update("INSERT INTO platform_account(id) VALUES(?)",account);jdbc.update("INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,created_at,updated_at) VALUES(?,?,'RESET','COMPLETED',0,0,?,?)",operation,account,now,now);jdbc.update("INSERT INTO security_notice(id,event_key,resource_id,credential_operation_id,recipient_account_id,locale,created_at) VALUES(?,'PASSWORD_CHANGED',?,?,?,'en',?)",notice,operation,operation,account,now);jdbc.update("INSERT INTO notification(id,recipient_account_id,event_key,text,created_at) VALUES(?,?,'PASSWORD_CHANGED','Synthetic retained content',?)",notice,account,now);jdbc.update("UPDATE inbox_work SET state='PUBLISHED',completed_at=? WHERE id=?",now,notice);});
  jdbc.update("INSERT INTO external_fanout(source_kind,source_id,created_at) VALUES('RESET',?,?)",source,now);jdbc.update("INSERT INTO external_job(id,source_kind,source_id,channel,state,next_attempt_at,terminal_at,rendered_body,rendered_destination,provider_reference,created_at) VALUES(?,'RESET',?,'EMAIL','DELIVERED',?,?,decode('112233','hex'),'synthetic@example.com',?,?)",job,source,now,now,reference.toString(),now);jdbc.update("INSERT INTO email_callback(id,payload_hash,provider_reference,event_type,received_at) VALUES('synthetic-migration',repeat('a',64),?,'email.delivered',?)",reference,now);
  var before=new HashMap<String,List<String>>();for(String table:List.of("account_identity","credential_operation","security_notice","inbox_work","notification","external_fanout","external_job","email_callback","audit_event"))before.put(table,jdbc.queryForList("SELECT (to_jsonb(r)-'privacy_retired_at')::text FROM "+table+" r ORDER BY to_jsonb(r)::text",String.class));
  MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
  for(var entry:before.entrySet()){String table=entry.getKey(),removed=table.equals("inbox_work")?"-'retired'":Set.of("external_job","email_callback").contains(table)?"-'metadata_retired'":"";assertThat(jdbc.queryForList("SELECT(to_jsonb(r)-'privacy_retired_at'"+removed+")::text FROM "+table+" r ORDER BY(to_jsonb(r)-'privacy_retired_at'"+removed+")::text",String.class)).as(table).isEqualTo(entry.getValue());}
  assertThat(jdbc.queryForObject("SELECT NOT retired FROM inbox_work WHERE id=?",Boolean.class,notice)).isTrue();assertThat(jdbc.queryForObject("SELECT NOT metadata_retired FROM external_job WHERE id=?",Boolean.class,job)).isTrue();assertThat(jdbc.queryForObject("SELECT NOT metadata_retired FROM email_callback WHERE id='synthetic-migration'",Boolean.class)).isTrue();assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE indexname IN('ix_inbox_work_retention','ix_external_job_metadata_retention','ix_external_job_unmapped_uncertainty','ix_callback_metadata_retention')",Integer.class)).isEqualTo(4);new DatabaseReadiness(ds).verifySchema();
 }
}
