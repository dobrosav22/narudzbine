-- Qualified authenticated HTTP process only. No raw disposition/source DML.
GRANT SELECT ON privacy_case_disposition_metadata,privacy_redaction_fulfillment_metadata TO __RUNTIME_ROLE__;
GRANT EXECUTE ON FUNCTION record_case_disposition(uuid,uuid,bytea,uuid,uuid,text,bigint,jsonb,boolean,boolean,jsonb,bytea,jsonb,uuid,uuid,timestamptz) TO __RUNTIME_ROLE__;
