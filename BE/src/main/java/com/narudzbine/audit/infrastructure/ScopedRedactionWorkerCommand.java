package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import com.zaxxer.hikari.*;
import java.net.URI;
import java.nio.file.Path;
import java.time.Clock;
import java.util.*;
import org.springframework.core.env.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import tools.jackson.databind.json.JsonMapper;

/** Explicit one-job command. Never starts the HTTP server or an automatic executor. */
public final class ScopedRedactionWorkerCommand {
    private ScopedRedactionWorkerCommand() {}

    public static void run(String[] args, Map<String, String> environment) {
        UUID job = parse(args);
        var properties = new HashMap<String, Object>();
        environment.forEach((key, value) -> {
            if (key.startsWith("REDACTION_WORKER_")) {
                properties.put("audit.redaction-worker." + key.substring(17).toLowerCase(Locale.ROOT).replace('_', '-'), value);
            }
        });
        // Optional existing application settings are used only to reject credential/key reuse.
        copy(environment, properties, "IDENTITY_PROVIDER_API_KEY", "identity.provider.api-key");
        copy(environment, properties, "DATABASE_URL", "spring.datasource.url");
        copy(environment, properties, "DATABASE_USERNAME", "spring.datasource.username");
        copy(environment, properties, "MEDIA_STORAGE_BUCKET", "media.storage.bucket");
        copy(environment, properties, "MEDIA_STORAGE_ACCESS_KEY", "media.storage.access-key");
        copy(environment, properties, "MEDIA_STORAGE_SECRET_KEY", "media.storage.secret-key");
        copy(environment, properties, "PRIVACY_EXPORT_ARTIFACT_KEY", "privacy.exports.artifact-key");
        copy(environment, properties, "REPORTING_EXPORT_ARTIFACT_KEY", "reporting.exports.artifact-key");
        copy(environment, properties, "PRIVACY_EXPORTS_ARTIFACT_KEY", "privacy.exports.artifact-key");
        copy(environment, properties, "REPORTING_EXPORTS_ARTIFACT_KEY", "reporting.exports.artifact-key");
        var env = new StandardEnvironment();
        env.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        env.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        env.getPropertySources().addFirst(new MapPropertySource("explicit-worker-input", properties));
        var settings = ScopedRedactionSettings.read(env);
        IndependentObjects objects = null;
        HikariDataSource pool = null;
        try {
            objects = settings.mode.equals("LOCAL_SYNTHETIC")
                    ? new FileIndependentObjectStore(Path.of(settings.localRoot))
                    : new R2IndependentObjectStore(R2IndependentObjectStore.client(URI.create(settings.endpoint), settings.access, settings.secret), settings.bucket);
            var evidence = new IndependentEvidence(objects, settings.keys, settings.active, settings.prohibited);
            var config = new HikariConfig();
            config.setJdbcUrl(settings.url);
            config.setUsername(settings.username);
            config.setPassword(settings.password);
            config.setMaximumPoolSize(2);
            config.setMinimumIdle(0);
            config.setConnectionTimeout(3000);
            config.setPoolName("scoped-redaction-worker");
            config.setConnectionInitSql("SET statement_timeout='10s'; SET lock_timeout='2s'; SET TIME ZONE 'UTC'");
            pool = new HikariDataSource(config);
            var jdbc = new JdbcTemplate(pool);
            ScopedRedactionAuthority.verify(jdbc);
            var clock = Clock.systemUTC();
            var worker = new ScopedRedactionWorker(jdbc, new JdbcTransactionManager(pool), evidence, clock,
                    new UuidGenerator(clock), settings.environment, settings.reference, settings.identityEndpoint==null?null:new FusionAuthContainmentVerifier(URI.create(settings.identityEndpoint),settings.identityTenant,settings.identityKey,settings.identityConformance,settings.identityAbsence,clock));
            var result = worker.run(job, args.length == 3);
            System.out.println(JsonMapper.builder().build().writeValueAsString(result));
        } catch (RuntimeException failure) {
            throw new IllegalStateException("Scoped redaction command did not complete; inspect restricted job metadata");
        } finally {
            if (pool != null) pool.close();
            AuditArchiveConfiguration.closeStore(objects);
        }
    }

    static UUID parse(String[] args) {
        try {
            if (args.length < 2 || args.length > 3 || !args[0].equals("--redaction-worker")
                    || (args.length == 3 && !args[2].equals("--completion-only"))) throw new IllegalArgumentException();
            UUID id = UUID.fromString(args[1]);
            if (!id.toString().equals(args[1]) || id.version() != 7 || id.variant() != 2) throw new IllegalArgumentException();
            return id;
        } catch (RuntimeException failure) {
            throw new IllegalArgumentException("Expected --redaction-worker <UUIDv7> [--completion-only]");
        }
    }

    private static void copy(Map<String, String> source, Map<String, Object> target, String from, String to) {
        if (source.containsKey(from)) target.put(to, source.get(from));
    }
}
