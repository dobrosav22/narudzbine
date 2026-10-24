package com.narudzbine.reporting.infrastructure;
import org.springframework.jdbc.core.JdbcTemplate;
/** Reject owner, schema-writer, broad source readers and incomplete worker grants at startup. */
public final class PortableWorkerAuthority {
 private PortableWorkerAuthority(){}
 public static void verify(JdbcTemplate jdbc){
  Boolean restricted=jdbc.queryForObject("""
   SELECT NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)
   AND NOT has_schema_privilege(current_user,'public','CREATE')
   AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p')
     AND(EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND c.relname<>'backend_schema_version' AND NOT(c.relname='retention_hold' AND a.attname='state') AND has_column_privilege(current_user,c.oid,a.attnum,'SELECT')) OR has_any_column_privilege(current_user,c.oid,'INSERT') OR has_any_column_privilege(current_user,c.oid,'UPDATE') OR has_table_privilege(current_user,c.oid,'DELETE,TRUNCATE,TRIGGER')))
   AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND(c.relname LIKE 'privacy_source_%' AND c.relname<>'privacy_source_scope' OR c.relname='privacy_export_work') AND NOT has_table_privilege(current_user,c.oid,'SELECT'))
   AND NOT has_table_privilege(current_user,'privacy_source_scope','SELECT')
   AND has_function_privilege(current_user,'lock_privacy_export(uuid,timestamptz)','EXECUTE')
   AND has_function_privilege(current_user,'fail_privacy_export(uuid,text,timestamptz)','EXECUTE')
   AND has_function_privilege(current_user,'publish_privacy_export(uuid,bytea,bytea,integer,integer,timestamptz)','EXECUTE')
   AND has_function_privilege(current_user,'sweep_privacy_exports(timestamptz)','EXECUTE')
   AND(SELECT version FROM backend_schema_version WHERE id=1)=78
   FROM pg_roles WHERE rolname=current_user
   """,Boolean.class);
  if(!Boolean.TRUE.equals(restricted))throw new IllegalStateException("Restricted portable JSON worker database role required");
 }
}
