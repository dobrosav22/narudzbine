package com.narudzbine.foundation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.narudzbine.BackendApplication;
import com.narudzbine.shared.infrastructure.database.DatabaseReadiness;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.DriverManager;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class FoundationIT {
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336")
            .asCompatibleSubstituteFor("postgres"));
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    @Test void replayRotationUpgradePreservesLegacyResendAndRequiresExplicitKeyAdoption()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020000000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var manager=new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource());UUID actor=UUID.randomUUID(),invitation=UUID.randomUUID(),key=UUID.randomUUID();var now=java.time.Instant.parse("2026-10-19T12:00:00Z");new org.springframework.transaction.support.TransactionTemplate(manager).executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic migration','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);jdbc.update("INSERT INTO setup_invitation(id,sender_id,recipient_email,country,type,reason,token_hash,state,created_at,updated_at,expires_at) VALUES (?,?,'synthetic-migration@example.com','RS','BUYER','Synthetic migration',decode(repeat('01',32),'hex'),'PENDING',?,?,?)",invitation,actor,java.sql.Timestamp.from(now),java.sql.Timestamp.from(now),java.sql.Timestamp.from(now.plusSeconds(604800)));jdbc.update("UPDATE setup_invitation SET token_hash=decode(repeat('02',32),'hex'),generation=2,revision=2,updated_at=?,expires_at=? WHERE id=?",java.sql.Timestamp.from(now.plusSeconds(60)),java.sql.Timestamp.from(now.plusSeconds(604860)),invitation);jdbc.update("INSERT INTO invitation_resend(sender_id,invitation_id,key,expected_revision,result_revision,result_generation,created_at,expires_at,result_expires_at) VALUES (?,?,?,'legacy-original-request',2,2,?,?,?)",actor,invitation,key,java.sql.Timestamp.from(now.plusSeconds(60)),java.sql.Timestamp.from(now.plusSeconds(604860)),java.sql.Timestamp.from(now.plusSeconds(604860)));});var before=jdbc.queryForMap("SELECT * FROM invitation_resend WHERE invitation_id=?",invitation);MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());var after=jdbc.queryForMap("SELECT * FROM invitation_resend WHERE invitation_id=?",invitation);assertThat(after.remove("original_revision")).isNull();assertThat(after).isEqualTo(before);String encoded=java.util.Base64.getEncoder().encodeToString(new byte[32]);var clock=java.time.Clock.fixed(now,java.time.ZoneOffset.UTC);assertThatThrownBy(()->new com.narudzbine.identity.application.ReplayFingerprintPolicy(jdbc,manager,encoded,false,clock).bind()).isInstanceOf(IllegalStateException.class).hasMessageContaining("explicitly pinned");assertThat(jdbc.queryForObject("SELECT count(*) FROM replay_fingerprint_binding",Integer.class)).isZero();new com.narudzbine.identity.application.ReplayFingerprintPolicy(jdbc,manager,encoded,true,clock).bind();new com.narudzbine.identity.application.ReplayFingerprintPolicy(jdbc,manager,encoded,false,clock).bind();assertThat(jdbc.queryForObject("SELECT count(*) FROM replay_fingerprint_binding",Integer.class)).isEqualTo(1);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test void orderSubmissionUpgradeFromReviewsPreservesPriorData()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019235900").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var before=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(before);assertThat(jdbc.queryForObject("SELECT count(*) FROM purchase_order",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test
    void controlledMigrationAndRuntimePermissions() throws Exception {
        String url = isolatedDatabase();
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        String runtimePassword = UUID.randomUUID().toString();
        String role = "runtime_" + UUID.randomUUID().toString().replace("-", "");
        try (var owner = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = owner.createStatement()) {
            sql.execute("CREATE ROLE " + role + " LOGIN PASSWORD '" + runtimePassword + "'");
            sql.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
            sql.execute("GRANT USAGE ON SCHEMA public TO " + role);
            sql.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO " + role);
            try (var rows = sql.executeQuery("SELECT count(*) FROM flyway_schema_history WHERE success")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getInt(1)).isEqualTo(79);
            }
        }
        try (var runtime = DriverManager.getConnection(url, role, runtimePassword);
                var sql = runtime.createStatement()) {
            assertThatThrownBy(() -> sql.execute("CREATE TABLE forbidden (id integer)"))
                    .isInstanceOf(java.sql.SQLException.class);
            assertThatThrownBy(() -> sql.execute("UPDATE backend_schema_version SET version=99"))
                    .isInstanceOf(java.sql.SQLException.class);
        }
        new DatabaseReadiness(new DriverManagerDataSource(url, role, runtimePassword)).verifySchema();
        try (var app = start(url, role, runtimePassword)) {
            assertThat(app.getBean(com.narudzbine.subscriptions.api.VendorPlans.class)).isNotNull();
            int businessPort = ((WebServerApplicationContext) app).getWebServer().getPort();
            int managementPort = Integer.parseInt(app.getEnvironment().getProperty("local.management.port"));
            assertThat(managementPort).isNotEqualTo(businessPort);
            assertThat(get(businessPort, "/actuator/health").statusCode()).isEqualTo(404);
            assertThat(get(businessPort, "/api/v1/anything").statusCode()).isEqualTo(404);
            assertThat(get(businessPort, "/api/v1/me").statusCode()).isEqualTo(404);
            assertThat(get(businessPort, "/api/v1/locales").statusCode()).isEqualTo(404);
            assertThat(get(businessPort, "/api/v1/organization/privacy-cases/019a0000-0000-7000-8000-000000000000").statusCode()).isEqualTo(404);
            for(String scope:java.util.List.of("organization","admin"))for(String suffix:java.util.List.of("export","exports/019a0000-0000-7000-8000-000000000001"))assertThat(get(businessPort,"/api/v1/"+scope+"/privacy-cases/019a0000-0000-7000-8000-000000000000/"+suffix).statusCode()).isEqualTo(404);
            assertThat(get(businessPort,"/api/v1/organization/privacy-cases/019a0000-0000-7000-8000-000000000000/exports/019a0000-0000-7000-8000-000000000001/content").statusCode()).isEqualTo(404);
            assertThat(get(businessPort, "/api/v1/admin/privacy-cases/019a0000-0000-7000-8000-000000000000").statusCode()).isEqualTo(404);
            assertThat(http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+businessPort+"/api/v1/admin/privacy-cases/019a0000-0000-7000-8000-000000000000/review")).POST(HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(404);
            assertThat(HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+businessPort+"/api/v1/me/deactivation")).POST(HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(404);
            assertThat(get(businessPort,"/api/v1/organization/audit").statusCode()).isEqualTo(404);
            assertThat(get(businessPort,"/api/v1/admin/audit").statusCode()).isEqualTo(404);
            for(String path:new String[]{"/api/v1/admin/organizations","/api/v1/admin/summary","/api/v1/admin/organizations/019a0000-0000-7000-8000-000000000000/members"})assertThat(get(businessPort,path).statusCode()).isEqualTo(404);
            assertThat(get(businessPort,"/api/v1/admin/support/organizations/019a0000-0000-7000-8000-000000000000/products").statusCode()).isEqualTo(404);
            for(String suffix:new String[]{"","/content"})assertThat(get(businessPort,"/api/v1/exports/019a0000-0000-7000-8000-000000000000"+suffix).statusCode()).isEqualTo(404);
            for(String kind:new String[]{"summary","products","buyers"})assertThat(get(businessPort,"/api/v1/reports/"+kind+"?from=2026-01-01&to=2026-01-01&grouping=DAY").statusCode()).isEqualTo(404);
            assertThat(get(businessPort, "/api/v1/organization").statusCode()).isEqualTo(404);
            var health = get(managementPort, "/actuator/health/readiness");
            assertThat(health.statusCode()).isEqualTo(200);
            assertThat(health.body()).contains("UP").doesNotContain("jdbc:", runtimePassword);
            assertThat(get(managementPort, "/actuator/env").statusCode()).isEqualTo(404);
            try (var owner = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                    var sql = owner.createStatement()) {
                sql.execute("UPDATE backend_schema_version SET version=99");
            }
            assertThat(get(businessPort, "/api/v1/anything").statusCode()).isEqualTo(503);
            assertThat(get(managementPort, "/actuator/health/readiness").statusCode()).isEqualTo(503);
            assertThat(get(managementPort, "/actuator/health/liveness").statusCode()).isEqualTo(200);
        }
    }

    @Test
    void previousFoundationSchemaRequiresControlledUpgrade() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261016000000").cleanDisabled(true).load().migrate();
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        readiness.verifySchema();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT version FROM backend_schema_version WHERE id = 1")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(78);
        }
    }

    @Test
    void ordinaryStartupNeverMigratesAnEmptyDatabase() throws Exception {
        String url = isolatedDatabase();
        assertThatThrownBy(() -> start(url, DATABASE.getUsername(), DATABASE.getPassword()))
                .isInstanceOf(Exception.class);
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isZero();
        }
    }

    @Test
    void csrfUpgradeRevokesOnlyPriorBrowserSessionsAndIsRepeatSafe() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261017100000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            connection.commit();
        }
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isTrue();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
    }

    @Test
    void auditUpgradePreservesBothTransportsWithoutInventingHistory() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261017110000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isZero();
        }
    }

    @Test
    void languageUpgradePreservesExistingPreferenceSessionsAndAudit() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261017120000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            sql.execute("UPDATE account_identity SET language_override = 'bs-Latn-BA' WHERE id = '" + account + "'");
            sql.execute("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) "
                    + "SELECT '" + UUID.randomUUID() + "','PLATFORM_ADMIN',account_id,'SESSION_CREATED','SESSION',id,'SUCCESS','"
                    + UUID.randomUUID() + "',current_timestamp,ARRAY['session'] FROM application_session WHERE transport='NATIVE'");
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT language_override FROM account_identity")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("bs-Latn-BA");
        }
    }

    @Test
    void organizationAuditUpgradePreservesPriorAccountSessionAndAuditData() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261017130000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            sql.execute("UPDATE account_identity SET language_override = 'bs-Latn-BA' WHERE id = '" + account + "'");
            sql.execute("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) "
                    + "SELECT '" + UUID.randomUUID() + "','PLATFORM_ADMIN',account_id,'SESSION_CREATED','SESSION',id,'SUCCESS','"
                    + UUID.randomUUID() + "',current_timestamp,ARRAY['session'] FROM application_session WHERE transport='NATIVE'");
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT language_override FROM account_identity")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("bs-Latn-BA");
        }
    }

    @Test
    void locationUpgradePreservesPriorAccountSessionAndAuditData() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261017140000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            sql.execute("UPDATE account_identity SET language_override = 'bs-Latn-BA' WHERE id = '" + account + "'");
            sql.execute("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) "
                    + "SELECT '" + UUID.randomUUID() + "','PLATFORM_ADMIN',account_id,'SESSION_CREATED','SESSION',id,'SUCCESS','"
                    + UUID.randomUUID() + "',current_timestamp,ARRAY['session'] FROM application_session WHERE transport='NATIVE'");
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT language_override FROM account_identity")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("bs-Latn-BA");
        }
    }

    @Test
    void profileAuditUpgradePreservesPriorAccountSessionAndAuditData() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261017150000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            sql.execute("UPDATE account_identity SET language_override = 'bs-Latn-BA' WHERE id = '" + account + "'");
            sql.execute("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) "
                    + "SELECT '" + UUID.randomUUID() + "','PLATFORM_ADMIN',account_id,'SESSION_CREATED','SESSION',id,'SUCCESS','"
                    + UUID.randomUUID() + "',current_timestamp,ARRAY['session'] FROM application_session WHERE transport='NATIVE'");
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT language_override FROM account_identity")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("bs-Latn-BA");
        }
    }

    @Test
    void contactUpgradePreservesPriorAccountSessionAndAuditData() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261017160000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            sql.execute("UPDATE account_identity SET language_override = 'bs-Latn-BA' WHERE id = '" + account + "'");
            sql.execute("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) "
                    + "SELECT '" + UUID.randomUUID() + "','PLATFORM_ADMIN',account_id,'SESSION_CREATED','SESSION',id,'SUCCESS','"
                    + UUID.randomUUID() + "',current_timestamp,ARRAY['session'] FROM application_session WHERE transport='NATIVE'");
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT language_override FROM account_identity")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("bs-Latn-BA");
        }
    }

    @Test
    void externalUpgradePreservesPriorAccountSessionsClaimsAndCredentialMapping() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261018160000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            sql.execute("INSERT INTO managed_password_identity(account_id,tenant_id,provider_user_id) VALUES ('"+account+"','"+UUID.randomUUID()+"','"+UUID.randomUUID()+"')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            sql.execute("UPDATE account_identity SET language_override = 'bs-Latn-BA' WHERE id = '" + account + "'");
            sql.execute("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) "
                    + "SELECT '" + UUID.randomUUID() + "','PLATFORM_ADMIN',account_id,'SESSION_CREATED','SESSION',id,'SUCCESS','"
                    + UUID.randomUUID() + "',current_timestamp,ARRAY['session'] FROM application_session WHERE transport='NATIVE'");
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT language_override FROM account_identity")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("bs-Latn-BA");
        }
        var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));
        assertThat(jdbc.queryForObject("SELECT password_usable FROM managed_password_identity WHERE account_id=?",Boolean.class,account)).isTrue();
        assertThat(jdbc.queryForObject("SELECT account_id FROM login_email_claim WHERE email='migration@example.com'",UUID.class)).isEqualTo(account);
        UUID binding=UUID.randomUUID();jdbc.update("INSERT INTO external_identity(id,account_id,provider,issuer,subject,created_at,updated_at) VALUES (?,?,'GOOGLE','https://google.example','reserved',current_timestamp,current_timestamp)",binding,account);
        assertThatThrownBy(()->jdbc.update("UPDATE external_identity SET subject='moved' WHERE id=?",binding)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(()->jdbc.update("DELETE FROM external_identity WHERE id=?",binding)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(()->jdbc.update("UPDATE managed_password_identity SET password_usable=false WHERE account_id=?",account)).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test
    void recoveryUpgradePreservesSessionsAndCredentialClaims() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261018180000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            sql.execute("UPDATE account_identity SET language_override = 'bs-Latn-BA' WHERE id = '" + account + "'");
            sql.execute("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) "
                    + "SELECT '" + UUID.randomUUID() + "','PLATFORM_ADMIN',account_id,'SESSION_CREATED','SESSION',id,'SUCCESS','"
                    + UUID.randomUUID() + "',current_timestamp,ARRAY['session'] FROM application_session WHERE transport='NATIVE'");
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));
        assertThat(jdbc.queryForObject("SELECT account_id FROM login_email_claim WHERE email='migration@example.com'",UUID.class)).isEqualTo(account);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM recovery_case",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM recovery_delivery",Integer.class)).isZero();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT language_override FROM account_identity")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("bs-Latn-BA");
        }
    }

    @Test
    void orderResponseUpgradeFromPreviousSchemaPreservesIdentityAndPlanConfiguration()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020020000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID actor=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);});var identity=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor);var plans=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(plans);assertThat(jdbc.queryForObject("SELECT count(*) FROM order_response",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM order_stock_credit",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void uploadUpgradeFromPreviousSchemaPreservesIdentityAndPlanConfiguration()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020110000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID actor=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);});var identity=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor);var plans=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(plans);assertThat(jdbc.queryForObject("SELECT count(*) FROM media_upload",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test
    void galleryUpgradeFromPreviousSchemaPreservesIdentityAndPlanConfiguration()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020100000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID actor=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);});var identity=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor);var plans=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(plans);assertThat(jdbc.queryForObject("SELECT count(*) FROM catalogue_product_gallery",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test
    void csvImportUpgradeFromPreviousSchemaPreservesIdentityAndPlanConfiguration()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020090000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID actor=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);});var identity=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor);var plans=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(plans);assertThat(jdbc.queryForObject("SELECT count(*) FROM catalogue_import_preview",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test
    void replacementsUpgradeFromPreviousSchemaPreservesIdentityAndPlanConfiguration()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020080000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID actor=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);});var identity=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor);var plans=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(plans);assertThat(jdbc.queryForObject("SELECT count(*) FROM order_replacement",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test
    void messagesUpgradeFromPreviousSchemaPreservesIdentityAndPlanConfiguration()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020070000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID actor=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);});var identity=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor);var plans=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(plans);assertThat(jdbc.queryForObject("SELECT count(*) FROM order_message",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test
    void dispatchUpgradeFromPreviousSchemaPreservesIdentityAndPlanConfiguration()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020060000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID actor=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);});var identity=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor);var plans=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(plans);assertThat(jdbc.queryForObject("SELECT count(*) FROM order_progress",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test
    void orderStagesUpgradeFromPreviousSchemaPreservesIdentityAndPlanConfiguration()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020050000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID actor=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);});var identity=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor);var plans=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(plans);assertThat(jdbc.queryForObject("SELECT count(*) FROM order_stage",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test
    void cancellationRequestsUpgradeFromPreviousSchemaPreservesIdentityAndPlanConfiguration()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020040000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID actor=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);});var identity=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor);var plans=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(plans);assertThat(jdbc.queryForObject("SELECT count(*) FROM cancellation_request",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test
    void cancellationUpgradeFromPreviousSchemaPreservesIdentityAndPlanConfiguration()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020030000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID actor=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",actor);});var identity=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor);var plans=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",actor)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(plans);assertThat(jdbc.queryForObject("SELECT count(*) FROM order_cancellation",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }
    @Test
    void draftSubmissionUpgradePreservesOpenAndDiscardedIntentAndReceipts()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261020010000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));UUID buyer=UUID.randomUUID(),vendor=UUID.randomUUID(),actor=UUID.randomUUID();
        tx.executeWithoutResult(status->{for(String type:java.util.List.of("VENDOR","BUYER")){UUID org=type.equals("VENDOR")?vendor:buyer,account=type.equals("BUYER")?actor:UUID.randomUUID();jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",account,account+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,?,'RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",org,type,org.toString(),account);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",account,org);}for(boolean discard:java.util.List.of(false,true)){UUID draft=UUID.randomUUID();jdbc.update("INSERT INTO buyer_draft(id,buyer_id,vendor_id,preparation,creator_id,last_editor_id,created_at,updated_at) VALUES (?,?,?,'{\"note\":\"retained\"}',?,?,now(),now())",draft,buyer,vendor,actor,actor);jdbc.update("INSERT INTO draft_creation(draft_id,creator_id,payload_hash,original_snapshot,expires_at) VALUES (?,?,decode(repeat('01',32),'hex'),'{\"legacy\":true}',now()+interval '7 days')",draft,actor);if(discard){jdbc.update("UPDATE buyer_draft SET state='DISCARDED',discarded_from_revision=revision,revision=revision+1 WHERE id=?",draft);}}});
        var before=jdbc.queryForList("SELECT to_jsonb(d)::text AS snapshot FROM buyer_draft d ORDER BY id");var receipts=jdbc.queryForList("SELECT to_jsonb(d)::text AS snapshot FROM draft_creation d ORDER BY draft_id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForList("SELECT (to_jsonb(d)-'submitted_order_id')::text AS snapshot FROM buyer_draft d ORDER BY id")).isEqualTo(before);assertThat(jdbc.queryForList("SELECT to_jsonb(d)::text AS snapshot FROM draft_creation d ORDER BY draft_id")).isEqualTo(receipts);assertThat(jdbc.queryForObject("SELECT count(*) FROM buyer_draft WHERE submitted_order_id IS NOT NULL",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM draft_order_submission",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void orderReviewsUpgradeFromPreviousReleasePreservesExistingSchemaAndIsRepeatable()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019230000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var prior=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(prior);assertThat(jdbc.queryForObject("SELECT count(*) FROM order_review",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void draftsUpgradeFromPreviousReleaseIsRepeatableAndPreservesFavorites()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019220000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));UUID vendor=UUID.randomUUID(),buyer=UUID.randomUUID(),product=UUID.randomUUID();tx.executeWithoutResult(status->{for(var type:java.util.List.of("VENDOR","BUYER")){UUID organization=type.equals("VENDOR")?vendor:buyer,actor=UUID.randomUUID();jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,?,'RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",organization,type,organization.toString(),actor);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,organization);}jdbc.update("INSERT INTO organization_plan(organization_id,plan_revision_id) SELECT ?,id FROM plan_revision WHERE code='STARTER'",vendor);jdbc.update("INSERT INTO catalogue_product_identity(id,vendor_id) VALUES (?,?)",product,vendor);jdbc.update("INSERT INTO catalogue_product(id,vendor_id,sku,normalized_sku,name,normalized_name,minimum_quantity,quantity_step,created_at,updated_at) VALUES (?,?,'RETAINED','retained','Synthetic','synthetic',1,1,now(),now())",product,vendor);jdbc.update("INSERT INTO product_sku_reservation(vendor_id,normalized_sku,product_id) VALUES (?,'retained',?)",vendor,product);jdbc.update("INSERT INTO buyer_favorite(buyer_id,vendor_id,product_id,created_at) VALUES (?,?,?,now())",buyer,vendor,product);});var favorite=jdbc.queryForMap("SELECT * FROM buyer_favorite WHERE buyer_id=?",buyer);var prior=jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id");MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForList("SELECT * FROM plan_revision ORDER BY id")).isEqualTo(prior);assertThat(jdbc.queryForObject("SELECT count(*) FROM buyer_draft",Integer.class)).isZero();assertThat(jdbc.queryForMap("SELECT * FROM buyer_favorite WHERE buyer_id=?",buyer)).isEqualTo(favorite);assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void favoritesUpgradeFromPreviousReleasePreservesIdentityAndIsRepeatable()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019210000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));UUID id=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",id,id+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES (?)",id);});var before=jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",id);MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a WHERE id=?",id)).isEqualTo(before);assertThat(jdbc.queryForObject("SELECT count(*) FROM buyer_favorite",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void activationUpgradePreservesExistingStockAndKeepsProductsInactive()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019200000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));UUID vendor=UUID.randomUUID(),actor=UUID.randomUUID(),product=UUID.randomUUID(),quota=UUID.randomUUID();
        tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,'VENDOR','RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",vendor,vendor.toString(),actor);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,vendor);jdbc.update("INSERT INTO organization_plan(organization_id,plan_revision_id) SELECT ?,id FROM plan_revision WHERE code='STARTER'",vendor);jdbc.update("INSERT INTO catalogue_product_identity(id,vendor_id) VALUES (?,?),(?,?)",product,vendor,quota,vendor);jdbc.update("INSERT INTO catalogue_product(id,vendor_id,sku,normalized_sku,name,normalized_name,minimum_quantity,quantity_step,created_at,updated_at) VALUES (?,?,'STOCK-1','stock-1','Synthetic','synthetic',1,1,now(),now())",product,vendor);jdbc.update("INSERT INTO product_sku_reservation(vendor_id,normalized_sku,product_id) VALUES (?,'stock-1',?)",vendor,product);jdbc.update("UPDATE product_pricing SET base_price=100,revision=revision+1 WHERE product_id=?",product);});
        tx.executeWithoutResult(status->{jdbc.update("UPDATE stock_balance SET available_count=5,credit_quantity=3,confirmed_epoch=1,revision=revision+1 WHERE product_id=?",product);jdbc.update("INSERT INTO stock_event(id,vendor_id,product_id,type,before_count,after_count,delta,actor_id,created_at) VALUES (?,?,?,'INITIALIZED',NULL,5,5,?,now())",UUID.randomUUID(),vendor,product,actor);jdbc.update("INSERT INTO stock_replay(actor_id,operation,identity_hash,vendor_id,product_id,payload_hash,original_result,expires_at) VALUES (?,'ABSOLUTE',decode(repeat('01',32),'hex'),?,?,decode(repeat('02',32),'hex'),'{}',now()+interval '7 days')",actor,vendor,product);});
        var tables=java.util.List.of("inventory_control","stock_balance","stock_event","stock_replay");var before=new java.util.HashMap<String,java.util.List<java.util.Map<String,Object>>>();for(String table:tables){before.put(table,jdbc.queryForList("SELECT "+(table.equals("stock_replay")?"(to_jsonb(t)-'original_revision')":"to_jsonb(t)")+"::text AS snapshot FROM "+table+" t"));}MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());for(String table:tables){assertThat(jdbc.queryForList("SELECT "+(table.equals("stock_replay")?"(to_jsonb(t)-'original_revision')":"to_jsonb(t)")+"::text AS snapshot FROM "+table+" t")).isEqualTo(before.get(table));}assertThat(jdbc.queryForObject("SELECT count(*) FROM inventory_preview",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM inventory_lifecycle_replay",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT active FROM catalogue_product_identity WHERE id=?",Boolean.class,product)).isFalse();assertThat(jdbc.queryForObject("SELECT count(*) FROM stock_replay WHERE original_revision IS NOT NULL",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void reconciliationUpgradePreservesCountsCreditsEpochsEventsAndReplay()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019190000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));UUID vendor=UUID.randomUUID(),actor=UUID.randomUUID(),product=UUID.randomUUID(),quota=UUID.randomUUID();
        tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,'VENDOR','RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",vendor,vendor.toString(),actor);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,vendor);jdbc.update("INSERT INTO organization_plan(organization_id,plan_revision_id) SELECT ?,id FROM plan_revision WHERE code='STARTER'",vendor);jdbc.update("INSERT INTO catalogue_product_identity(id,vendor_id) VALUES (?,?),(?,?)",product,vendor,quota,vendor);jdbc.update("INSERT INTO catalogue_product(id,vendor_id,sku,normalized_sku,name,normalized_name,minimum_quantity,quantity_step,created_at,updated_at) VALUES (?,?,'STOCK-1','stock-1','Synthetic','synthetic',1,1,now(),now())",product,vendor);jdbc.update("INSERT INTO product_sku_reservation(vendor_id,normalized_sku,product_id) VALUES (?,'stock-1',?)",vendor,product);jdbc.update("UPDATE product_pricing SET base_price=100,revision=revision+1 WHERE product_id=?",product);});
        tx.executeWithoutResult(status->{jdbc.update("UPDATE stock_balance SET available_count=5,credit_quantity=3,confirmed_epoch=1,revision=revision+1 WHERE product_id=?",product);jdbc.update("INSERT INTO stock_event(id,vendor_id,product_id,type,before_count,after_count,delta,actor_id,created_at) VALUES (?,?,?,'INITIALIZED',NULL,5,5,?,now())",UUID.randomUUID(),vendor,product,actor);jdbc.update("INSERT INTO stock_replay(actor_id,operation,identity_hash,vendor_id,product_id,payload_hash,original_result,expires_at) VALUES (?,'ABSOLUTE',decode(repeat('01',32),'hex'),?,?,decode(repeat('02',32),'hex'),'{}',now()+interval '7 days')",actor,vendor,product);});
        var tables=java.util.List.of("inventory_control","stock_balance","stock_event","stock_replay");var before=new java.util.HashMap<String,java.util.List<java.util.Map<String,Object>>>();for(String table:tables){before.put(table,jdbc.queryForList("SELECT "+(table.equals("stock_replay")?"(to_jsonb(t)-'original_revision')":"to_jsonb(t)")+"::text AS snapshot FROM "+table+" t"));}MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());for(String table:tables){assertThat(jdbc.queryForList("SELECT "+(table.equals("stock_replay")?"(to_jsonb(t)-'original_revision')":"to_jsonb(t)")+"::text AS snapshot FROM "+table+" t")).isEqualTo(before.get(table));}assertThat(jdbc.queryForObject("SELECT count(*) FROM inventory_preview",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM inventory_lifecycle_replay",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM stock_replay WHERE original_revision IS NOT NULL",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void inventoryUpgradePreservesGenuineProductsAndPricesWithoutInventingCounts()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019180000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));UUID vendor=UUID.randomUUID(),actor=UUID.randomUUID(),product=UUID.randomUUID(),quota=UUID.randomUUID();
        tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,'VENDOR','RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",vendor,vendor.toString(),actor);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,vendor);jdbc.update("INSERT INTO organization_plan(organization_id,plan_revision_id) SELECT ?,id FROM plan_revision WHERE code='STARTER'",vendor);jdbc.update("INSERT INTO catalogue_product_identity(id,vendor_id) VALUES (?,?),(?,?)",product,vendor,quota,vendor);jdbc.update("INSERT INTO catalogue_product(id,vendor_id,sku,normalized_sku,name,normalized_name,minimum_quantity,quantity_step,created_at,updated_at) VALUES (?,?,'STOCK-1','stock-1','Synthetic','synthetic',1,1,now(),now())",product,vendor);jdbc.update("INSERT INTO product_sku_reservation(vendor_id,normalized_sku,product_id) VALUES (?,'stock-1',?)",vendor,product);jdbc.update("UPDATE product_pricing SET base_price=100,revision=revision+1 WHERE product_id=?",product);});
        var before=jdbc.queryForMap("SELECT * FROM catalogue_product WHERE id=?",product);var price=jdbc.queryForMap("SELECT * FROM product_pricing WHERE product_id=?",product);MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT * FROM catalogue_product WHERE id=?",product)).isEqualTo(before);assertThat(jdbc.queryForMap("SELECT * FROM product_pricing WHERE product_id=?",product)).isEqualTo(price);assertThat(jdbc.queryForObject("SELECT count(*) FROM stock_balance",Integer.class)).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT available_count FROM stock_balance WHERE product_id=?",Integer.class,product)).isNull();assertThat(jdbc.queryForObject("SELECT enabled FROM inventory_control WHERE vendor_id=?",Boolean.class,vendor)).isFalse();assertThat(jdbc.queryForObject("SELECT count(*) FROM stock_event",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void promotionUpgradePreservesExistingTaxonomyReferencesWithoutInventingDefinitions()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019170000").cleanDisabled(true).load().migrate();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));UUID vendor=UUID.randomUUID(),actor=UUID.randomUUID(),category=UUID.randomUUID(),promotion=UUID.randomUUID();
        tx.executeWithoutResult(status->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,'VENDOR','RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",vendor,vendor.toString(),actor);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,vendor);jdbc.update("INSERT INTO catalogue_taxonomy(id,vendor_id,kind,name,normalized_name,created_at,updated_at) VALUES (?,?,'CATEGORY','Synthetic','synthetic',now(),now())",category,vendor);jdbc.update("INSERT INTO catalogue_promotion_identity(id,vendor_id) VALUES (?,?)",promotion,vendor);jdbc.update("INSERT INTO catalogue_promotion_taxonomy(promotion_id,taxonomy_id) VALUES (?,?)",promotion,category);});
        var identity=jdbc.queryForMap("SELECT * FROM catalogue_promotion_identity WHERE id=?",promotion);var refs=jdbc.queryForList("SELECT * FROM catalogue_promotion_taxonomy WHERE promotion_id=?",promotion);MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT * FROM catalogue_promotion_identity WHERE id=?",promotion)).isEqualTo(identity);assertThat(jdbc.queryForList("SELECT * FROM catalogue_promotion_taxonomy WHERE promotion_id=?",promotion)).isEqualTo(refs);assertThat(jdbc.queryForObject("SELECT count(*) FROM promotion",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM promotion_history",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void agreedPriceUpgradePreservesExistingRelationshipGenerationWithoutInventingPrices()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019160000").cleanDisabled(true).load().migrate();
        var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
        UUID vendor=UUID.randomUUID(),buyer=UUID.randomUUID(),relationship=UUID.randomUUID();
        tx.executeWithoutResult(status->{for(UUID org:java.util.List.of(vendor,buyer)){UUID actor=UUID.randomUUID();jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,?,'BA','BAM','Synthetic','Synthetic',?,'Synthetic','Synthetic','71000','BA','en','ACTIVE',?)",org,org.equals(vendor)?"VENDOR":"BUYER",org.toString(),actor);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,org);}jdbc.update("INSERT INTO organization_plan(organization_id,plan_revision_id) SELECT ?,id FROM plan_revision WHERE code='STARTER'",vendor);jdbc.update("INSERT INTO trading_relationship(id,vendor_id,buyer_id,country,state,created_at,updated_at) VALUES (?,?,?,'BA','ACTIVE',now(),now())",relationship,vendor,buyer);jdbc.update("UPDATE trading_relationship SET state='DISCONNECTED',disconnected_reason='Synthetic',revision=revision+1 WHERE id=?",relationship);jdbc.update("UPDATE trading_relationship SET state='ACTIVE',disconnected_reason=NULL,connection_generation=connection_generation+1,agreed_price_confirmation_required=true,revision=revision+1 WHERE id=?",relationship);});
        var before=jdbc.queryForMap("SELECT * FROM trading_relationship WHERE id=?",relationship);MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForMap("SELECT * FROM trading_relationship WHERE id=?",relationship)).isEqualTo(before);assertThat(jdbc.queryForObject("SELECT revision FROM relationship_pricing WHERE relationship_id=?",Long.class,relationship)).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM agreed_price",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM agreed_price_history",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void pricingUpgradeInitializesOnlyGenuineDetailsWithoutInventingAmounts()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019150000").cleanDisabled(true).load().migrate();
        var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
        UUID vendor=UUID.randomUUID(),actor=UUID.randomUUID(),product=UUID.randomUUID(),quota=UUID.randomUUID();
        tx.executeWithoutResult(status->{
            jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");
            jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,'VENDOR','RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",vendor,vendor.toString(),actor);
            jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,vendor);jdbc.update("INSERT INTO organization_plan(organization_id,plan_revision_id) SELECT ?,id FROM plan_revision WHERE code='STARTER'",vendor);
            jdbc.update("INSERT INTO catalogue_product_identity(id,vendor_id) VALUES (?,?),(?,?)",product,vendor,quota,vendor);
            jdbc.update("INSERT INTO catalogue_product(id,vendor_id,sku,normalized_sku,name,normalized_name,minimum_quantity,quantity_step,created_at,updated_at) VALUES (?,?,'OLD-1','old-1','Synthetic','synthetic',5,5,now(),now())",product,vendor);
            jdbc.update("INSERT INTO product_sku_reservation(vendor_id,normalized_sku,product_id) VALUES (?,'old-1',?)",vendor,product);
        });
        var before=jdbc.queryForMap("SELECT * FROM catalogue_product WHERE id=?",product);var reservations=jdbc.queryForList("SELECT * FROM product_sku_reservation WHERE product_id=?",product);
        MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());
        assertThat(jdbc.queryForMap("SELECT * FROM catalogue_product WHERE id=?",product)).isEqualTo(before);assertThat(jdbc.queryForList("SELECT * FROM product_sku_reservation WHERE product_id=?",product)).isEqualTo(reservations);assertThat(jdbc.queryForObject("SELECT count(*) FROM product_pricing",Integer.class)).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT base_price FROM product_pricing WHERE product_id=?",java.math.BigDecimal.class,product)).isNull();assertThat(jdbc.queryForObject("SELECT revision FROM product_pricing WHERE product_id=?",Long.class,product)).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM product_pricing_history",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM product_volume_tier",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void productUpgradePreservesRealQuotaIdentityAndTaxonomyWithoutFabricatingSku()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019140000").cleanDisabled(true).load().migrate();
        var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));
        var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
        UUID vendor=UUID.randomUUID(),actor=UUID.randomUUID(),product=UUID.randomUUID(),unit=UUID.randomUUID();
        tx.executeWithoutResult(status->{
            jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");
            jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,'VENDOR','RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",vendor,vendor.toString(),actor);
            jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,vendor);
            jdbc.update("INSERT INTO organization_plan(organization_id,plan_revision_id) SELECT ?,id FROM plan_revision WHERE code='STARTER'",vendor);
            jdbc.update("INSERT INTO catalogue_taxonomy(id,vendor_id,kind,name,normalized_name,created_at,updated_at) VALUES (?,?,'UNIT','kg','kg',now(),now())",unit,vendor);
            jdbc.update("INSERT INTO catalogue_product_identity(id,vendor_id,archived,unit_id) VALUES (?,?,true,?)",product,vendor,unit);
        });
        var before=jdbc.queryForMap("SELECT * FROM catalogue_product_identity WHERE id=?",product);var tax=jdbc.queryForMap("SELECT * FROM catalogue_taxonomy WHERE id=?",unit);var plan=jdbc.queryForMap("SELECT * FROM organization_plan WHERE organization_id=?",vendor);
        before.put("active",false); // Migration31 adds only an inactive publication default to this legacy identity.
        MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());
        assertThat(jdbc.queryForMap("SELECT * FROM catalogue_product_identity WHERE id=?",product)).isEqualTo(before);assertThat(jdbc.queryForMap("SELECT * FROM catalogue_taxonomy WHERE id=?",unit)).isEqualTo(tax);assertThat(jdbc.queryForMap("SELECT * FROM organization_plan WHERE organization_id=?",vendor)).isEqualTo(plan);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM catalogue_product",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM product_sku_reservation",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void taxonomyUpgradePreservesExistingProductsPlansAndPartnerHistory()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019130000").cleanDisabled(true).load().migrate();UUID vendor=UUID.randomUUID(),buyer=UUID.randomUUID(),vo=UUID.randomUUID(),bo=UUID.randomUUID(),relationship=UUID.randomUUID();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
        tx.executeWithoutResult(status->{for(UUID account:java.util.List.of(vo,bo)){UUID org=account.equals(vo)?vendor:buyer;String type=account.equals(vo)?"VENDOR":"BUYER";jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",account,account+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,?,'RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",org,type,org.toString(),account);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",account,org);}jdbc.update("INSERT INTO organization_plan(organization_id,plan_revision_id) SELECT ?,id FROM plan_revision WHERE code='GROWTH'",vendor);jdbc.update("INSERT INTO trading_relationship(id,vendor_id,buyer_id,country,state,created_at,updated_at) VALUES (?,?,?,'RS','ACTIVE',now(),now())",relationship,vendor,buyer);jdbc.update("UPDATE trading_relationship SET state='DISCONNECTED',disconnected_reason='Retained history',revision=revision+1 WHERE id=?",relationship);});
        UUID product=UUID.randomUUID();jdbc.update("INSERT INTO catalogue_product_identity(id,vendor_id,archived) VALUES (?,?,true)",product,vendor);var priorProduct=jdbc.queryForMap("SELECT id,vendor_id,archived FROM catalogue_product_identity WHERE id=?",product);
        var snapshots=jdbc.queryForList("SELECT * FROM partner_snapshot ORDER BY organization_id");UUID plan=jdbc.queryForObject("SELECT plan_revision_id FROM organization_plan WHERE organization_id=?",UUID.class,vendor);MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForList("SELECT * FROM partner_snapshot ORDER BY organization_id")).isEqualTo(snapshots);assertThat(jdbc.queryForObject("SELECT plan_revision_id FROM organization_plan WHERE organization_id=?",UUID.class,vendor)).isEqualTo(plan);assertThat(jdbc.queryForObject("SELECT revision FROM organization_plan WHERE organization_id=?",Long.class,vendor)).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM catalogue_product_identity",Integer.class)).isEqualTo(1);assertThat(jdbc.queryForMap("SELECT id,vendor_id,archived FROM catalogue_product_identity WHERE id=?",product)).isEqualTo(priorProduct);assertThat(jdbc.queryForObject("SELECT count(*) FROM catalogue_taxonomy",Integer.class)).isZero();assertThat(jdbc.queryForMap("SELECT unit_id,category_id FROM catalogue_product_identity WHERE id=?",product).values()).containsOnlyNulls();assertThat(jdbc.queryForObject("SELECT count(*) FROM plan_change_request",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void planUpgradePreservesPinnedAssignmentsAndPartnerHistoryWithoutInventingProducts()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019120000").cleanDisabled(true).load().migrate();UUID vendor=UUID.randomUUID(),buyer=UUID.randomUUID(),vo=UUID.randomUUID(),bo=UUID.randomUUID(),relationship=UUID.randomUUID();var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
        tx.executeWithoutResult(status->{for(UUID account:java.util.List.of(vo,bo)){UUID org=account.equals(vo)?vendor:buyer;String type=account.equals(vo)?"VENDOR":"BUYER";jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",account,account+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,?,'RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",org,type,org.toString(),account);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",account,org);}jdbc.update("INSERT INTO organization_plan SELECT ?,id FROM plan_revision WHERE code='GROWTH'",vendor);jdbc.update("INSERT INTO trading_relationship(id,vendor_id,buyer_id,country,state,created_at,updated_at) VALUES (?,?,?,'RS','ACTIVE',now(),now())",relationship,vendor,buyer);jdbc.update("UPDATE trading_relationship SET state='DISCONNECTED',disconnected_reason='Retained history',revision=revision+1 WHERE id=?",relationship);});
        var snapshots=jdbc.queryForList("SELECT * FROM partner_snapshot ORDER BY organization_id");UUID plan=jdbc.queryForObject("SELECT plan_revision_id FROM organization_plan WHERE organization_id=?",UUID.class,vendor);MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());assertThat(jdbc.queryForList("SELECT * FROM partner_snapshot ORDER BY organization_id")).isEqualTo(snapshots);assertThat(jdbc.queryForObject("SELECT plan_revision_id FROM organization_plan WHERE organization_id=?",UUID.class,vendor)).isEqualTo(plan);assertThat(jdbc.queryForObject("SELECT revision FROM organization_plan WHERE organization_id=?",Long.class,vendor)).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM catalogue_product_identity",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM plan_change_request",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void partnerUpgradePreservesLegacyHistoryWithoutInventingDirectorySnapshots()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019110000").cleanDisabled(true).load().migrate();
        UUID vendor=UUID.randomUUID(),buyer=UUID.randomUUID(),vo=UUID.randomUUID(),bo=UUID.randomUUID(),relationship=UUID.randomUUID(),invitation=UUID.randomUUID();
        var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));
        var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
        tx.executeWithoutResult(status->{
            for(UUID account:java.util.List.of(vo,bo)){UUID org=account.equals(vo)?vendor:buyer;String type=account.equals(vo)?"VENDOR":"BUYER";
                jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",account,account+"@example.com");
                jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,?,'RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",org,type,org.toString(),account);
                jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",account,org);
            }
            jdbc.update("INSERT INTO business_contact(id,organization_id,label,contact_name,contact_phone,state,created_at,updated_at) VALUES (?,?,'Private','Private contact','+381 11 123','ACTIVE',now(),now())",UUID.randomUUID(),vendor);
            jdbc.update("INSERT INTO organization_plan SELECT ?,id FROM plan_revision WHERE code='STARTER'",vendor);
            jdbc.update("INSERT INTO trading_relationship(id,vendor_id,buyer_id,country,state,created_at,updated_at) VALUES (?,?,?,'RS','ACTIVE',now(),now())",relationship,vendor,buyer);
            jdbc.update("INSERT INTO setup_invitation(id,sender_id,recipient_email,country,type,reason,token_hash,state,created_at,updated_at,expires_at,purpose,organization_id,buyer_id) VALUES (?,?,?,'RS','BUYER','Synthetic',decode(repeat('11',32),'hex'),'ACCEPTED',now(),now(),now()+interval '168 hours','TRADING',?,?)",invitation,vo,bo+"@example.com",vendor,buyer);
            jdbc.update("INSERT INTO trading_acceptance SELECT ?,id,connection_generation,revision,agreed_price_confirmation_required,created_at,updated_at,now(),now()+interval '7 days' FROM trading_relationship WHERE id=?",invitation,relationship);
            jdbc.update("UPDATE trading_relationship SET state='DISCONNECTED',disconnected_reason='Retained reason',revision=revision+1 WHERE id=?",relationship);
            jdbc.update("UPDATE trading_relationship SET state='ACTIVE',disconnected_reason=NULL,connection_generation=connection_generation+1,agreed_price_confirmation_required=true,revision=revision+1 WHERE id=?",relationship);
            jdbc.update("UPDATE trading_relationship SET state='DISCONNECTED',disconnected_reason='Retained reason',revision=revision+1 WHERE id=?",relationship);
        });
        var before=jdbc.queryForMap("SELECT * FROM trading_relationship WHERE id=?",relationship);var receipt=jdbc.queryForMap("SELECT * FROM trading_acceptance WHERE invitation_id=?",invitation);
        MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());
        assertThat(jdbc.queryForMap("SELECT * FROM trading_relationship WHERE id=?",relationship)).isEqualTo(before);assertThat(jdbc.queryForMap("SELECT * FROM trading_acceptance WHERE invitation_id=?",invitation)).isEqualTo(receipt);
        assertThat(jdbc.queryForObject("SELECT state FROM setup_invitation WHERE id=?",String.class,invitation)).isEqualTo("ACCEPTED");assertThat(jdbc.queryForObject("SELECT count(*) FROM partner_snapshot",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM organization WHERE partner_contact_id IS NOT NULL",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM ordinary_delivery",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
        var trading=new com.narudzbine.trading.application.JdbcTradingConnections(jdbc,java.time.Clock.systemUTC(),new com.narudzbine.shared.api.UuidGenerator(java.time.Clock.systemUTC()),org.mockito.Mockito.mock(com.narudzbine.audit.api.TradingAudit.class));
        tx.executeWithoutResult(status->{assertThatThrownBy(()->trading.partner(buyer,vendor)).isInstanceOf(com.narudzbine.trading.api.TradingFailure.class);});
        tx.executeWithoutResult(status->{jdbc.update("UPDATE trading_relationship SET state='ACTIVE',disconnected_reason=NULL,connection_generation=connection_generation+1,agreed_price_confirmation_required=true,revision=revision+1 WHERE id=?",relationship);jdbc.update("UPDATE trading_relationship SET state='DISCONNECTED',disconnected_reason='Actual new transition',revision=revision+1 WHERE id=?",relationship);});
        tx.executeWithoutResult(status->{var projection=trading.partner(buyer,vendor);assertThat(projection.relationshipState()).isEqualTo("DISCONNECTED");assertThat(projection.businessContact()).isNull();});
        assertThat(jdbc.queryForObject("SELECT count(*) FROM partner_snapshot",Integer.class)).isEqualTo(2);
    }

    @Test
    void connectionLifecycleUpgradePreservesPairsReceiptsAndDoesNotBackfillNotices()throws Exception{
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019100000").cleanDisabled(true).load().migrate();
        UUID vendor=UUID.randomUUID(),buyer=UUID.randomUUID(),vo=UUID.randomUUID(),bo=UUID.randomUUID(),relationship=UUID.randomUUID(),invitation=UUID.randomUUID();
        var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));
        var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
        tx.executeWithoutResult(status->{
            for(UUID account:java.util.List.of(vo,bo)){UUID org=account.equals(vo)?vendor:buyer;String type=account.equals(vo)?"VENDOR":"BUYER";
                jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",account,account+"@example.com");
                jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,?,'RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",org,type,org.toString(),account);
                jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",account,org);
            }
            jdbc.update("INSERT INTO organization_plan SELECT ?,id FROM plan_revision WHERE code='STARTER'",vendor);
            jdbc.update("INSERT INTO trading_relationship(id,vendor_id,buyer_id,country,state,created_at,updated_at) VALUES (?,?,?,'RS','ACTIVE',now(),now())",relationship,vendor,buyer);
            jdbc.update("INSERT INTO setup_invitation(id,sender_id,recipient_email,country,type,reason,token_hash,state,created_at,updated_at,expires_at,purpose,organization_id,buyer_id) VALUES (?,?,?,'RS','BUYER','Synthetic',decode(repeat('11',32),'hex'),'ACCEPTED',now(),now(),now()+interval '168 hours','TRADING',?,?)",invitation,vo,bo+"@example.com",vendor,buyer);
            jdbc.update("INSERT INTO trading_acceptance SELECT ?,id,connection_generation,revision,agreed_price_confirmation_required,created_at,updated_at,now(),now()+interval '7 days' FROM trading_relationship WHERE id=?",invitation,relationship);
            jdbc.update("UPDATE trading_relationship SET state='DISCONNECTED',disconnected_reason='Retained reason',revision=revision+1 WHERE id=?",relationship);
            jdbc.update("UPDATE trading_relationship SET state='ACTIVE',disconnected_reason=NULL,connection_generation=connection_generation+1,agreed_price_confirmation_required=true,revision=revision+1 WHERE id=?",relationship);
            jdbc.update("UPDATE trading_relationship SET state='DISCONNECTED',disconnected_reason='Retained reason',revision=revision+1 WHERE id=?",relationship);
        });
        var before=jdbc.queryForMap("SELECT * FROM trading_relationship WHERE id=?",relationship);var receipt=jdbc.queryForMap("SELECT * FROM trading_acceptance WHERE invitation_id=?",invitation);
        MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());
        assertThat(jdbc.queryForMap("SELECT * FROM trading_relationship WHERE id=?",relationship)).isEqualTo(before);assertThat(jdbc.queryForMap("SELECT * FROM trading_acceptance WHERE invitation_id=?",invitation)).isEqualTo(receipt);
        assertThat(jdbc.queryForObject("SELECT state FROM setup_invitation WHERE id=?",String.class,invitation)).isEqualTo("ACCEPTED");assertThat(jdbc.queryForObject("SELECT count(*) FROM ordinary_notice",Integer.class)).isZero();assertThat(jdbc.queryForObject("SELECT count(*) FROM ordinary_delivery",Integer.class)).isZero();new DatabaseReadiness(jdbc.getDataSource()).verifySchema();
    }

    @Test
    void tradingUpgradePreservesMemberContextUnknownIntentAndEmailHold() throws Exception {
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261019090000").cleanDisabled(true).load().migrate();
        UUID actor=UUID.randomUUID(),org=UUID.randomUUID(),inv=UUID.randomUUID(),intent=UUID.randomUUID();
        try(var c=DriverManager.getConnection(url,DATABASE.getUsername(),DATABASE.getPassword());var q=c.createStatement()){
            c.setAutoCommit(false);q.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"+actor+"','BUSINESS','vendor@example.com',true,'Synthetic','ACTIVE')");
            q.execute("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES ('"+org+"','VENDOR','RS','RSD','Synthetic','Synthetic','SYNTHETIC','Synthetic','Synthetic','11000','RS','en','ACTIVE','"+actor+"')");q.execute("INSERT INTO business_account(id,organization_id,role) VALUES ('"+actor+"','"+org+"','OWNER')");
            q.execute("INSERT INTO organization_plan SELECT '"+org+"',id FROM plan_revision WHERE code='STARTER'");
            q.execute("INSERT INTO setup_invitation(id,sender_id,recipient_email,country,type,reason,token_hash,state,created_at,updated_at,expires_at,purpose,organization_id,invited_role) VALUES ('"+inv+"','"+actor+"','member@example.com','RS','VENDOR','Synthetic',decode(repeat('11',32),'hex'),'PENDING',now(),now(),now()+interval '168 hours','MEMBER','"+org+"','STAFF')");
            q.execute("INSERT INTO setup_intent(id,invitation_id,generation,tenant_id,provider_user_id,account_id,organization_id,payload,request_digest,state,created_at,updated_at,member_setup) VALUES ('"+intent+"','"+inv+"',1,'"+UUID.randomUUID()+"','"+UUID.randomUUID()+"','"+UUID.randomUUID()+"','"+org+"','{}',decode(repeat('33',32),'hex'),'UNKNOWN',now(),now(),true)");q.execute("INSERT INTO setup_email_claim VALUES ('member@example.com','"+intent+"')");c.commit();
        }
        MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());
        try(var c=DriverManager.getConnection(url,DATABASE.getUsername(),DATABASE.getPassword());var q=c.createStatement();var r=q.executeQuery("SELECT i.purpose,i.invited_role,i.buyer_id,s.state,s.member_setup,(SELECT count(*) FROM setup_email_claim),(SELECT count(*) FROM trading_relationship),(SELECT count(*) FROM trading_acceptance) FROM setup_invitation i JOIN setup_intent s ON s.invitation_id=i.id")){
            assertThat(r.next()).isTrue();assertThat(r.getString(1)).isEqualTo("MEMBER");assertThat(r.getString(2)).isEqualTo("STAFF");assertThat(r.getObject(3)).isNull();assertThat(r.getString(4)).isEqualTo("UNKNOWN");assertThat(r.getBoolean(5)).isTrue();assertThat(r.getInt(6)).isEqualTo(1);assertThat(r.getInt(7)).isZero();assertThat(r.getInt(8)).isZero();assertThat(r.next()).isFalse();
        }
    }

    @Test
    void memberSetupUpgradePreservesPendingOrganizationInvitationsAndProofs() throws Exception {
        String url=isolatedDatabase();Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261018200000").cleanDisabled(true).load().migrate();
        UUID sender=UUID.randomUUID(),invitation=UUID.randomUUID(),proof=UUID.randomUUID(),intent=UUID.randomUUID();
        try(var c=DriverManager.getConnection(url,DATABASE.getUsername(),DATABASE.getPassword());var q=c.createStatement()){
            c.setAutoCommit(false);q.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"+sender+"','PLATFORM_ADMIN','upgrade@example.com',true,'Synthetic','ACTIVE')");q.execute("INSERT INTO platform_account(id) VALUES ('"+sender+"')");
            q.execute("INSERT INTO setup_invitation(id,sender_id,recipient_email,country,type,reason,token_hash,state,created_at,updated_at,expires_at) VALUES ('"+invitation+"','"+sender+"','intended@example.com','BA','BUYER','Synthetic verification',decode(repeat('11',32),'hex'),'PENDING',now(),now(),now()+interval '168 hours')");
            q.execute("INSERT INTO setup_email_proof(id,invitation_id,generation,token_hash,state,created_at,expires_at) VALUES ('"+proof+"','"+invitation+"',1,decode(repeat('22',32),'hex'),'USED',now(),now()+interval '30 minutes')");
            q.execute("INSERT INTO setup_intent(id,invitation_id,generation,tenant_id,provider_user_id,account_id,organization_id,payload,request_digest,state,created_at,updated_at) VALUES ('"+intent+"','"+invitation+"',1,'"+UUID.randomUUID()+"','"+UUID.randomUUID()+"','"+UUID.randomUUID()+"','"+UUID.randomUUID()+"','{}',decode(repeat('33',32),'hex'),'UNKNOWN',now(),now())");q.execute("INSERT INTO setup_email_claim(email,intent_id) VALUES ('intended@example.com','"+intent+"')");c.commit();
        }
        MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());
        try(var c=DriverManager.getConnection(url,DATABASE.getUsername(),DATABASE.getPassword());var q=c.createStatement();var r=q.executeQuery("SELECT i.purpose,i.organization_id,i.invited_role,s.member_setup,s.state,p.state,(SELECT count(*) FROM setup_email_claim) FROM setup_invitation i JOIN setup_intent s ON s.invitation_id=i.id JOIN setup_email_proof p ON p.invitation_id=i.id")){
            assertThat(r.next()).isTrue();assertThat(r.getString(1)).isEqualTo("ORGANIZATION");assertThat(r.getObject(2)).isNull();assertThat(r.getString(3)).isNull();assertThat(r.getBoolean(4)).isFalse();assertThat(r.getString(5)).isEqualTo("UNKNOWN");assertThat(r.getString(6)).isEqualTo("USED");assertThat(r.getInt(7)).isEqualTo(1);assertThat(r.next()).isFalse();
        }
    }

    @Test
    void setupUpgradePreservesIdentityAndClaimsAndSeedsImmutablePlanConfiguration() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261018190000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            sql.execute("UPDATE account_identity SET language_override = 'bs-Latn-BA' WHERE id = '" + account + "'");
            sql.execute("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) "
                    + "SELECT '" + UUID.randomUUID() + "','PLATFORM_ADMIN',account_id,'SESSION_CREATED','SESSION',id,'SUCCESS','"
                    + UUID.randomUUID() + "',current_timestamp,ARRAY['session'] FROM application_session WHERE transport='NATIVE'");
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        var jdbc=new org.springframework.jdbc.core.JdbcTemplate(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword()));
        assertThat(jdbc.queryForObject("SELECT account_id FROM login_email_claim WHERE email='migration@example.com'",UUID.class)).isEqualTo(account);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM plan_revision",Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT product_limit FROM plan_revision WHERE code='STARTER'",Integer.class)).isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT active_buyer_limit FROM plan_revision WHERE code='PRO'",Integer.class)).isEqualTo(500);
        assertThatThrownBy(()->jdbc.update("UPDATE plan_revision SET product_limit=999 WHERE code='STARTER'")).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM setup_intent",Integer.class)).isZero();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT language_override FROM account_identity")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("bs-Latn-BA");
        }
    }

    @Test
    void memberUpgradePreservesPriorAccountSessionAndAuditData() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261018100000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            sql.execute("UPDATE account_identity SET language_override = 'bs-Latn-BA' WHERE id = '" + account + "'");
            sql.execute("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) "
                    + "SELECT '" + UUID.randomUUID() + "','PLATFORM_ADMIN',account_id,'SESSION_CREATED','SESSION',id,'SUCCESS','"
                    + UUID.randomUUID() + "',current_timestamp,ARRAY['session'] FROM application_session WHERE transport='NATIVE'");
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT language_override FROM account_identity")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("bs-Latn-BA");
        }
    }

    @Test
    void ownershipUpgradePreservesPriorAccountSessionAndAuditData() throws Exception {
        String url = isolatedDatabase();
        Flyway.configure().dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .target("20261018110000").cleanDisabled(true).load().migrate();
        UUID account = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"
                    + account + "','PLATFORM_ADMIN','migration@example.com',true,'Migration fixture','ACTIVE')");
            sql.execute("INSERT INTO platform_account(id) VALUES ('" + account + "')");
            for (String transport : java.util.List.of("BROWSER", "NATIVE")) {
                String digest = transport.equals("BROWSER") ? "11" : "22";
                String csrf = transport.equals("BROWSER") ? "decode(repeat('33',32),'hex')" : "NULL";
                sql.execute("""
                        INSERT INTO application_session(id,account_id,transport,token_hash,csrf_token_hash,device_label,
                        created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch)
                        VALUES ('%s','%s','%s',decode(repeat('%s',32),'hex'),%s,'Migration fixture',
                        current_timestamp,current_timestamp,current_timestamp + interval '1 day',current_timestamp,'PASSWORD',0,0)
                        """.formatted(UUID.randomUUID(), account, transport, digest, csrf));
            }
            sql.execute("UPDATE account_identity SET language_override = 'bs-Latn-BA' WHERE id = '" + account + "'");
            sql.execute("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) "
                    + "SELECT '" + UUID.randomUUID() + "','PLATFORM_ADMIN',account_id,'SESSION_CREATED','SESSION',id,'SUCCESS','"
                    + UUID.randomUUID() + "',current_timestamp,ARRAY['session'] FROM application_session WHERE transport='NATIVE'");
            connection.commit();
        }
        var readiness = new DatabaseReadiness(new DriverManagerDataSource(
                url, DATABASE.getUsername(), DATABASE.getPassword()));
        assertThatThrownBy(readiness::verifySchema).isInstanceOf(IllegalStateException.class);
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT transport, revoked_at IS NOT NULL FROM application_session ORDER BY transport")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("BROWSER");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("NATIVE");
            assertThat(rows.getBoolean(2)).isFalse();
            assertThat(rows.next()).isFalse();
        }
        readiness.verifySchema();
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT count(*) FROM audit_event")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT language_override FROM account_identity")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("bs-Latn-BA");
        }
    }

    @Test
    void passwordUpgradePreservesOwnershipNoticeOutboxAndImmutableHistory() throws Exception {
        String url=isolatedDatabase();
        Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261018120000").cleanDisabled(true).load().migrate();
        UUID former=UUID.randomUUID(),next=UUID.randomUUID(),org=UUID.randomUUID(),transfer=UUID.randomUUID(),notice=UUID.randomUUID(),outbox=UUID.randomUUID();
        try(var connection=DriverManager.getConnection(url,DATABASE.getUsername(),DATABASE.getPassword());var sql=connection.createStatement()) {
            connection.setAutoCommit(false);
            for(UUID account:java.util.List.of(former,next)) {
                sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES ('"+account+"','BUSINESS','"+account+"@example.com',true,'Migration','ACTIVE')");
            }
            sql.execute("""
                    INSERT INTO organization(id,owner_account_id,type,country,currency,display_name,legal_name,registration_identifier,
                        address_line1,address_city,address_postal_code,address_country,default_language,state)
                    VALUES ('%s','%s','VENDOR','RS','RSD','Migration','Migration','TEST','Test','Test','00000','RS','sr-Latn-RS','ACTIVE')
                    """.formatted(org,next));
            sql.execute("INSERT INTO business_account(id,organization_id,role) VALUES ('"+former+"','"+org+"','ADMIN'),('"+next+"','"+org+"','OWNER')");
            sql.execute("""
                    INSERT INTO ownership_transfer(id,organization_id,issuer_id,recipient_id,recipient_epoch,request_revision_token,state,expires_at,created_at,updated_at)
                    VALUES ('%s','%s','%s','%s',0,'synthetic','ACCEPTED',current_timestamp+interval '7 days',current_timestamp,current_timestamp)
                    """.formatted(transfer,org,former,next));
            sql.execute("""
                    INSERT INTO security_notice(id,event_key,resource_id,organization_id,recipient_account_id,locale,created_at)
                    VALUES ('%s','OWNER_CHANGED','%s','%s','%s','sr-Latn-RS',current_timestamp)
                    """.formatted(notice,transfer,org,next));
            sql.execute("INSERT INTO outbox_event(id,notice_id,channel,state,created_at) VALUES ('"+outbox+"','"+notice+"','EMAIL','QUEUED',current_timestamp)");
            connection.commit();
        }
        MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());
        MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());
        new DatabaseReadiness(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword())).verifySchema();
        try(var connection=DriverManager.getConnection(url,DATABASE.getUsername(),DATABASE.getPassword());var sql=connection.createStatement()) {
            try(var rows=sql.executeQuery("SELECT n.id,n.resource_id,n.ownership_transfer_id,n.credential_operation_id,n.locale,e.id FROM security_notice n JOIN outbox_event e ON e.notice_id=n.id")) {
                assertThat(rows.next()).isTrue();assertThat(rows.getObject(1,UUID.class)).isEqualTo(notice);
                assertThat(rows.getObject(2,UUID.class)).isEqualTo(transfer);assertThat(rows.getObject(3,UUID.class)).isEqualTo(transfer);
                assertThat(rows.getObject(4)).isNull();assertThat(rows.getString(5)).isEqualTo("sr-Latn-RS");assertThat(rows.getObject(6,UUID.class)).isEqualTo(outbox);
                assertThat(rows.next()).isFalse();
            }
            assertThatThrownBy(()->sql.execute("UPDATE security_notice SET locale='en' WHERE id='"+notice+"'")).isInstanceOf(java.sql.SQLException.class);
            assertThatThrownBy(()->sql.execute("INSERT INTO security_notice(id,event_key,resource_id,organization_id,recipient_account_id,locale,created_at) VALUES ('"+UUID.randomUUID()+"','OWNER_CHANGED','"+transfer+"','"+org+"','"+former+"','en',current_timestamp)"))
                    .isInstanceOf(java.sql.SQLException.class);
        }
    }

    @Test
    void emailUpgradeBackfillsClaimsAndPreservesPasswordProofNoticeAndOutboxHistory() throws Exception {
        String url=isolatedDatabase();
        Flyway.configure().dataSource(url,DATABASE.getUsername(),DATABASE.getPassword()).target("20261018140000").cleanDisabled(true).load().migrate();
        UUID account=UUID.randomUUID(),operation=UUID.randomUUID(),proof=UUID.randomUUID(),notice=UUID.randomUUID(),outbox=UUID.randomUUID();
        try(var connection=DriverManager.getConnection(url,DATABASE.getUsername(),DATABASE.getPassword());var sql=connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state,security_epoch,credential_generation) VALUES ('"+account+"','PLATFORM_ADMIN','migration@example.com',true,'Migration','ACTIVE',1,1)");
            sql.execute("INSERT INTO platform_account(id) VALUES ('"+account+"')");
            sql.execute("INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,created_at,updated_at) VALUES ('"+operation+"','"+account+"','RESET','COMPLETED',1,0,current_timestamp,current_timestamp)");
            sql.execute("""
                    INSERT INTO password_reset_proof(id,account_id,token_hash,email,security_epoch,credential_generation,state,operation_id,created_at,expires_at)
                    VALUES ('%s','%s',decode(repeat('11',32),'hex'),'migration@example.com',0,0,'USED','%s',current_timestamp,current_timestamp+interval '30 minutes')
                    """.formatted(proof,account,operation));
            sql.execute("INSERT INTO security_notice(id,event_key,resource_id,credential_operation_id,recipient_account_id,locale,created_at) VALUES ('"+notice+"','PASSWORD_CHANGED','"+operation+"','"+operation+"','"+account+"','en',current_timestamp)");
            sql.execute("INSERT INTO outbox_event(id,notice_id,channel,state,created_at) VALUES ('"+outbox+"','"+notice+"','EMAIL','QUEUED',current_timestamp)");connection.commit();
        }
        MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());MigrationCommand.migrate(url,DATABASE.getUsername(),DATABASE.getPassword());
        new DatabaseReadiness(new DriverManagerDataSource(url,DATABASE.getUsername(),DATABASE.getPassword())).verifySchema();
        try(var connection=DriverManager.getConnection(url,DATABASE.getUsername(),DATABASE.getPassword());var sql=connection.createStatement()) {
            try(var row=sql.executeQuery("SELECT account_id,kind FROM login_email_claim WHERE email='migration@example.com'")) {
                assertThat(row.next()).isTrue();assertThat(row.getObject(1,UUID.class)).isEqualTo(account);assertThat(row.getString(2)).isEqualTo("CURRENT");
            }
            try(var row=sql.executeQuery("SELECT n.id,n.resource_id,e.id,e.destination_key,e.destination_email,p.state FROM security_notice n JOIN outbox_event e ON e.notice_id=n.id JOIN password_reset_proof p ON p.operation_id=n.credential_operation_id")) {
                assertThat(row.next()).isTrue();assertThat(row.getObject(1,UUID.class)).isEqualTo(notice);assertThat(row.getObject(2,UUID.class)).isEqualTo(operation);
                assertThat(row.getObject(3,UUID.class)).isEqualTo(outbox);assertThat(row.getString(4)).isEqualTo("CURRENT");assertThat(row.getObject(5)).isNull();assertThat(row.getString(6)).isEqualTo("USED");
            }
            assertThatThrownBy(()->sql.execute("DELETE FROM login_email_claim WHERE email='migration@example.com'")).isInstanceOf(java.sql.SQLException.class);
            assertThatThrownBy(()->sql.execute("UPDATE security_notice SET locale='sr-Latn-RS' WHERE id='"+notice+"'")).isInstanceOf(java.sql.SQLException.class);
        }
    }

    @Test
    void hibernateRejectsTypeMismatchWithoutRepairingIt() throws Exception {
        String url = isolatedDatabase();
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            sql.execute("ALTER TABLE backend_schema_version DROP CONSTRAINT backend_schema_version_version_check");
            sql.execute("ALTER TABLE backend_schema_version ALTER COLUMN version TYPE varchar USING version::text");
        }
        assertThatThrownBy(() -> start(url, DATABASE.getUsername(), DATABASE.getPassword()))
                .isInstanceOf(Exception.class);
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement();
                var rows = sql.executeQuery("SELECT data_type FROM information_schema.columns "
                        + "WHERE table_name='backend_schema_version' AND column_name='version'")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("character varying");
        }
    }

    @Test
    void schemaMismatchAndUnavailableDatabasePreventStartup() throws Exception {
        String url = isolatedDatabase();
        MigrationCommand.migrate(url, DATABASE.getUsername(), DATABASE.getPassword());
        try (var connection = DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            sql.execute("UPDATE backend_schema_version SET version=99");
        }
        assertThatThrownBy(() -> start(url, DATABASE.getUsername(), DATABASE.getPassword()))
                .isInstanceOf(Exception.class);
        assertThatThrownBy(() -> start("jdbc:postgresql://127.0.0.1:1/unavailable?connectTimeout=1", "test", "test"))
                .isInstanceOf(Exception.class);
    }

    private ConfigurableApplicationContext start(String url, String username, String password) {
        var application = new SpringApplication(BackendApplication.class);
        Map<String, Object> properties = new HashMap<>();
        properties.put("spring.datasource.url", url);
        properties.put("spring.datasource.username", username);
        properties.put("spring.datasource.password", password);
        properties.put("server.port", 0);
        properties.put("management.server.port", 0);
        properties.put("spring.main.banner-mode", "off");
        properties.put("logging.level.root", "WARN");
        application.setDefaultProperties(properties);
        return application.run("--spring.datasource.url=" + url, "--spring.datasource.username=" + username,
                "--spring.datasource.password=" + password, "--server.port=0", "--management.server.port=0");
    }

    private String isolatedDatabase() throws Exception {
        String name = "foundation_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(),
                DATABASE.getUsername(), DATABASE.getPassword()); var sql = connection.createStatement()) {
            sql.execute("CREATE DATABASE " + name);
        }
        return "jdbc:postgresql://" + DATABASE.getHost() + ":" + DATABASE.getMappedPort(5432) + "/" + name;
    }

    private HttpResponse<String> get(int port, String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }
}
