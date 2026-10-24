package com.narudzbine.reporting.infrastructure;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.reporting.application.PortableExportSettings;
import java.time.Clock;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.*;
class PortableExportConfigurationTest {
 private final ApplicationContextRunner context=new ApplicationContextRunner().withUserConfiguration(PortableExportConfiguration.class,Fixture.class);
 @Test void defaultOffDoesNotCreateAWorkerOrReplaceTheApplicationDataSource(){context.run(c->{assertThat(c).hasNotFailed();assertThat(c).doesNotHaveBean(PortableExportConfiguration.WorkerRuntime.class);assertThat(c).doesNotHaveBean(javax.sql.DataSource.class);});}
 @Test void enabledWorkerRequiresExplicitRestrictedCredentials(){context.withPropertyValues("privacy.exports.enabled=true","privacy.exports.worker-enabled=true","spring.datasource.url=jdbc:postgresql://unconfigured.invalid/local").run(c->assertThat(c).hasFailed().getFailure().hasRootCauseMessage("Explicit restricted portable worker credential for the application database required"));}
 @Test void workerCannotSilentlyUseADifferentDatabase(){context.withPropertyValues("privacy.exports.enabled=true","privacy.exports.worker-enabled=true","spring.datasource.url=jdbc:postgresql://unconfigured.invalid/local","privacy.exports.jdbc-url=jdbc:postgresql://unconfigured.invalid/other","privacy.exports.username=synthetic","privacy.exports.password=synthetic-local-value").run(c->assertThat(c).hasFailed().getFailure().hasRootCauseMessage("Explicit restricted portable worker credential for the application database required"));}
 @Configuration(proxyBeanMethods=false) static class Fixture {
  @Bean Clock clock(){return Clock.systemUTC();}
  @Bean PortableExportSettings settings(){return new PortableExportSettings(true,true,true,true,Base64.getEncoder().encodeToString(new byte[32]),"");}
 }
}
