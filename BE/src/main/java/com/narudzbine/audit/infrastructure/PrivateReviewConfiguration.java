package com.narudzbine.audit.infrastructure;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name="audit.privacy-review.enabled",havingValue="true")
public class PrivateReviewConfiguration {
 @Bean Object privateReviewPrivilegeGate(JdbcTemplate jdbc,Environment env){
  if(!env.getProperty("identity.http.enabled",Boolean.class,false))throw new IllegalStateException("Private review requires authenticated HTTP configuration");
  boolean safe=Boolean.TRUE.equals(jdbc.queryForObject("""
   SELECT has_function_privilege(current_user,'public.read_privacy_review(uuid,bytea,uuid,uuid,text,timestamptz)','EXECUTE')
    AND NOT has_schema_privilege(current_user,'public','CREATE')
    AND NOT has_column_privilege(current_user,'public.privacy_case','private_reason','SELECT')
    AND NOT has_column_privilege(current_user,'public.privacy_case','requester_id','SELECT')
    AND NOT has_table_privilege(current_user,'public.privacy_operator','INSERT,DELETE,TRUNCATE')
    AND NOT has_column_privilege(current_user,'public.privacy_operator','enabled','UPDATE')
    AND NOT has_column_privilege(current_user,'public.privacy_operator','revision','UPDATE')
    AND NOT has_column_privilege(current_user,'public.privacy_operator','created_at','UPDATE')
    AND NOT has_table_privilege(current_user,'public.privacy_operator','TRIGGER')
    AND NOT has_table_privilege(current_user,'public.privacy_operator_configuration_event','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    AND NOT has_function_privilege(current_user,'public.record_privacy_operator_configuration()','EXECUTE')
    AND NOT has_function_privilege(current_user,'public.protect_privacy_review_read()','EXECUTE')
    AND NOT has_function_privilege(current_user,'public.protect_privacy_review_access()','EXECUTE')
   """,Boolean.class));
  if(!safe)throw new IllegalStateException("Private review requires isolated source and qualification privileges");return new Object();
 }
}
