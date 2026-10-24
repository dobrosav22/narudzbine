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
class AuditReadMigrationIT {
    @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
    @Test void populatedSchema53RetainsAuditAndInstallsReadIndexes(){
        Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261021010000").cleanDisabled(true).load().migrate();
        var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);var ids=new UuidGenerator(Clock.fixed(Instant.parse("2026-10-21T00:00:00Z"),ZoneOffset.UTC));var actor=ids.next();var event=ids.next();var request=ids.next();
        new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(ds)).executeWithoutResult(s->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN','synthetic-audit-migration@example.com',true,'Synthetic','ACTIVE')",actor);jdbc.update("INSERT INTO platform_account(id) VALUES(?)",actor);});
        jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) VALUES(?,'PLATFORM_ADMIN',?,'ACCOUNT_LANGUAGE_CHANGED','ACCOUNT',?,'SUCCESS',?,?,ARRAY['languageOverride'])",event,actor,actor,request,Timestamp.from(Instant.parse("2026-10-21T00:00:00Z")));
        var before=jdbc.queryForList("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a");var audits=jdbc.queryForList("SELECT to_jsonb(a)::text AS snapshot FROM audit_event a ORDER BY id");String prior=jdbc.queryForObject("SELECT pg_get_expr(conbin,conrelid) FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource'",String.class);
        Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261021020000").load().migrate();Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261021020000").load().migrate();assertThat(jdbc.queryForList("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a")).isEqualTo(before);assertThat(jdbc.queryForList("SELECT to_jsonb(a)::text AS snapshot FROM audit_event a ORDER BY id")).isEqualTo(audits);assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN('ix_audit_time','ix_audit_action_time')",Integer.class)).isEqualTo(2);
        String after=jdbc.queryForObject("SELECT pg_get_expr(conbin,conrelid) FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource'",String.class);assertThat(after).isEqualTo(prior);MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());new DatabaseReadiness(ds).verifySchema();
    }
}
