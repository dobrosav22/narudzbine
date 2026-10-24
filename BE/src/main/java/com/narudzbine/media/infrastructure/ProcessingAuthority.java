package com.narudzbine.media.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;

public final class ProcessingAuthority {
    private ProcessingAuthority() {}
    public static void verify(JdbcTemplate jdbc) {
        Boolean restricted=jdbc.queryForObject("""
            SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)
              AND NOT has_schema_privilege(current_user,'public','CREATE')
              AND NOT has_table_privilege(current_user,'media_asset','INSERT')
              AND NOT has_table_privilege(current_user,'media_asset','DELETE')
              AND NOT has_column_privilege(current_user,'media_upload','sha256','UPDATE')
              AND NOT has_column_privilege(current_user,'organization','display_name','UPDATE')
              AND NOT has_table_privilege(current_user,'catalogue_product','UPDATE')
              AND has_column_privilege(current_user,'media_asset','processed_sha256','UPDATE')
              AND has_column_privilege(current_user,'media_processing_job','fence','UPDATE')
              AND has_column_privilege(current_user,'media_upload','raw_deleted_at','UPDATE')
              AND has_table_privilege(current_user,'media_upload_event','INSERT')
              AND has_function_privilege(current_user,'public.claim_media_disposal(uuid,text,timestamptz)','EXECUTE')
              AND has_function_privilege(current_user,'public.complete_media_disposal(uuid,text,timestamptz)','EXECUTE')
            FROM pg_roles WHERE rolname=current_user
            """,Boolean.class);
        if(!Boolean.TRUE.equals(restricted)) throw new IllegalStateException("Restricted processing database role required");
    }
}
