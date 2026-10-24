package com.narudzbine.audit.infrastructure;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
class ScopedRedactionConfigurationTest {
 private final ApplicationContextRunner context=new ApplicationContextRunner().withUserConfiguration(ScopedRedactionConfiguration.class);
 @Test void defaultOffCreatesNoGateOrDataSource(){context.run(c->{assertThat(c).hasNotFailed();assertThat(c).doesNotHaveBean("scopedRedactionPrivilegeGate");assertThat(c).doesNotHaveBean(javax.sql.DataSource.class);});}
 @Test void explicitActivationRequiresAuthenticatedHttp(){context.withBean(JdbcTemplate.class,()->mock(JdbcTemplate.class)).withPropertyValues("audit.redaction-plans.enabled=true").run(c->assertThat(c).hasFailed().getFailure().hasRootCauseMessage("Scoped redaction approval requires authenticated HTTP configuration"));}
 @Test void ordinaryRoleCannotActivateWithoutIsolation(){var jdbc=mock(JdbcTemplate.class);when(jdbc.queryForObject(anyString(),eq(Boolean.class))).thenReturn(false);context.withBean(JdbcTemplate.class,()->jdbc).withPropertyValues("audit.redaction-plans.enabled=true","identity.http.enabled=true").run(c->assertThat(c).hasFailed().getFailure().hasRootCauseMessage("Private review requires isolated source and qualification privileges"));}
 @Test void isolatedRoleStillNeedsTheNarrowProjectionGrant(){var jdbc=mock(JdbcTemplate.class);when(jdbc.queryForObject(anyString(),eq(Boolean.class))).thenAnswer(i->!i.<String>getArgument(0).contains("prepare_scoped_redaction"));context.withBean(JdbcTemplate.class,()->jdbc).withPropertyValues("audit.redaction-plans.enabled=true","identity.http.enabled=true").run(c->assertThat(c).hasFailed().getFailure().hasRootCauseMessage("Scoped approval requires isolated HTTP projection/action grants"));}
}
