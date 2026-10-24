package com.narudzbine.audit.infrastructure;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name="audit.case-dispositions.enabled",havingValue="true")
public class CaseDispositionConfiguration {
 @Bean Object caseDispositionPrivilegeGate(JdbcTemplate jdbc,Environment env){
  if(!env.getProperty("identity.http.enabled",Boolean.class,false))throw new IllegalStateException("Case dispositions require authenticated HTTP configuration");new PrivateReviewConfiguration().privateReviewPrivilegeGate(jdbc,env);
  boolean safe=Boolean.TRUE.equals(jdbc.queryForObject("SELECT has_table_privilege(current_user,'privacy_case_disposition_metadata','SELECT') AND has_table_privilege(current_user,'privacy_redaction_fulfillment_metadata','SELECT') AND NOT has_any_column_privilege(current_user,'privacy_case_disposition','SELECT') AND NOT has_table_privilege(current_user,'privacy_case_disposition','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AND NOT has_function_privilege(current_user,'apply_scoped_redaction(uuid,uuid,uuid,timestamptz)','EXECUTE') AND NOT has_function_privilege(current_user,'acknowledge_scoped_redaction(uuid,text,text,integer,text,timestamptz)','EXECUTE') AND NOT has_function_privilege(current_user,'acknowledge_identity_containment(uuid,uuid,text,timestamptz,timestamptz)','EXECUTE') AND has_function_privilege(current_user,'record_case_disposition(uuid,uuid,bytea,uuid,uuid,text,bigint,jsonb,boolean,boolean,jsonb,bytea,jsonb,uuid,uuid,timestamptz)','EXECUTE')",Boolean.class));if(!safe)throw new IllegalStateException("Case dispositions require isolated projection/action grants");return new Object();
 }
}
