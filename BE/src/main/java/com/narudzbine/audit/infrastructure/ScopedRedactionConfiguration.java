package com.narudzbine.audit.infrastructure;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name="audit.redaction-plans.enabled",havingValue="true")
public class ScopedRedactionConfiguration {
 @Bean Object scopedRedactionPrivilegeGate(JdbcTemplate jdbc,Environment env){
  if(!env.getProperty("identity.http.enabled",Boolean.class,false))throw new IllegalStateException("Scoped redaction approval requires authenticated HTTP configuration");new PrivateReviewConfiguration().privateReviewPrivilegeGate(jdbc,env);
  boolean safe=Boolean.TRUE.equals(jdbc.queryForObject("SELECT has_table_privilege(current_user,'privacy_redaction_metadata','SELECT') AND has_table_privilege(current_user,'privacy_redaction_fulfillment_metadata','SELECT') AND NOT has_table_privilege(current_user,'privacy_redaction_job','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AND NOT has_function_privilege(current_user,'apply_scoped_redaction(uuid,uuid,uuid,timestamptz)','EXECUTE') AND NOT has_function_privilege(current_user,'acknowledge_scoped_redaction(uuid,text,text,integer,text,timestamptz)','EXECUTE') AND has_function_privilege(current_user,'prepare_scoped_redaction(uuid,uuid,bytea,uuid,uuid,text,bigint,jsonb,bytea,jsonb,uuid,uuid,timestamptz,text)','EXECUTE') AND has_function_privilege(current_user,'cancel_scoped_redaction(uuid,uuid,bytea,uuid,uuid,text,bigint,bytea,jsonb,uuid,uuid,timestamptz)','EXECUTE')",Boolean.class));if(!safe)throw new IllegalStateException("Scoped approval requires isolated HTTP projection/action grants");return new Object();
 }
}
