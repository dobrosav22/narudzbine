package com.narudzbine.audit.infrastructure;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** A separate source-projection principal, never the application or migration owner. */
public final class ScopedRedactionAuthority {
 private ScopedRedactionAuthority(){}
 public static void verify(JdbcTemplate jdbc){
  Boolean safe=jdbc.queryForObject("""
   SELECT NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)
   AND NOT has_schema_privilege(current_user,'public','CREATE')
   AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p')
    AND(EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND c.relname<>'backend_schema_version' AND NOT(c.relname='retention_hold' AND a.attname='state') AND has_column_privilege(current_user,c.oid,a.attnum,'SELECT')) OR has_any_column_privilege(current_user,c.oid,'INSERT') OR has_any_column_privilege(current_user,c.oid,'UPDATE') OR has_table_privilege(current_user,c.oid,'DELETE,TRUNCATE,TRIGGER')))
   AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('v','m') AND c.relname NOT IN('privacy_redaction_worker_work') AND has_table_privilege(current_user,c.oid,'SELECT'))
   AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND p.proname NOT IN('apply_scoped_redaction','acknowledge_scoped_redaction','acknowledge_identity_containment') AND has_function_privilege(current_user,p.oid,'EXECUTE'))
   AND has_table_privilege(current_user,'privacy_redaction_worker_work','SELECT')
   AND has_function_privilege(current_user,'apply_scoped_redaction(uuid,uuid,uuid,timestamptz)','EXECUTE')
   AND has_function_privilege(current_user,'acknowledge_scoped_redaction(uuid,text,text,integer,text,timestamptz)','EXECUTE')
   AND has_function_privilege(current_user,'acknowledge_identity_containment(uuid,uuid,text,timestamptz,timestamptz)','EXECUTE')
   AND(SELECT version FROM backend_schema_version WHERE id=1)=78
   FROM pg_roles WHERE rolname=current_user
   """,Boolean.class);
  if(!Boolean.TRUE.equals(safe))throw new IllegalStateException("Restricted scoped redaction worker database role required");
 }
}
