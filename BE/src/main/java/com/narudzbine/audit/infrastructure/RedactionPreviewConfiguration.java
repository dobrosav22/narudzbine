package com.narudzbine.audit.infrastructure;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name="audit.redaction-preview.enabled",havingValue="true")
public class RedactionPreviewConfiguration {
 @Bean Object redactionPreviewPrivilegeGate(JdbcTemplate jdbc,Environment env){
  if(!env.getProperty("identity.http.enabled",Boolean.class,false))throw new IllegalStateException("Redaction preview requires authenticated HTTP configuration");
  new PrivateReviewConfiguration().privateReviewPrivilegeGate(jdbc,env);
  if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT has_function_privilege(current_user,'inspect_redaction_preview(uuid,bytea,uuid,uuid,text,timestamptz)','EXECUTE')",Boolean.class)))throw new IllegalStateException("Redaction preview requires its narrow projection grant");return new Object();
 }
}
