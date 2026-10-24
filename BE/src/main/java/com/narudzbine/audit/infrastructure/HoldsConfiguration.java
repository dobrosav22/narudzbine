package com.narudzbine.audit.infrastructure;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "audit.holds.enabled", havingValue = "true")
public class HoldsConfiguration {
    @Bean Object holdPrivilegeGate(JdbcTemplate jdbc, Environment environment) {
        String reference = environment.getProperty("audit.holds.worker-drain-reference", "").trim();
        if (!environment.getProperty("identity.http.enabled", Boolean.class, false) || reference.isEmpty() || reference.length() > 100)
            throw new IllegalStateException("Retention holds require authenticated HTTP and a reviewed worker-drain reference");
        new PrivateReviewConfiguration().privateReviewPrivilegeGate(jdbc, environment);
        boolean safe = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT NOT has_table_privilege(current_user,'retention_hold','DELETE,TRUNCATE,TRIGGER')
                AND NOT has_column_privilege(current_user,'retention_hold','activation_reference','SELECT')
                AND NOT has_column_privilege(current_user,'retention_hold','release_reference','SELECT')
                AND NOT has_function_privilege(current_user,'protect_retention_hold()','EXECUTE')
                AND NOT has_function_privilege(current_user,'guard_media_disposal_claim()','EXECUTE')
                AND NOT has_table_privilege(current_user,'media_disposal_claim','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
                """, Boolean.class));
        if (!safe) throw new IllegalStateException("Retention holds require isolated source and disposal privileges");
        return new Object();
    }
}
