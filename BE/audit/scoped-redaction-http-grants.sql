-- HTTP approval/status/cancellation only; no profile DML or independent-store credentials.
GRANT SELECT ON privacy_redaction_metadata TO __RUNTIME_ROLE__;
GRANT EXECUTE ON FUNCTION prepare_scoped_redaction(uuid,uuid,bytea,uuid,uuid,text,bigint,jsonb,bytea,jsonb,uuid,uuid,timestamptz) TO __RUNTIME_ROLE__;
GRANT EXECUTE ON FUNCTION cancel_scoped_redaction(uuid,uuid,bytea,uuid,uuid,text,bigint,bytea,jsonb,uuid,uuid,timestamptz) TO __RUNTIME_ROLE__;

GRANT EXECUTE ON FUNCTION prepare_scoped_redaction(uuid,uuid,bytea,uuid,uuid,text,bigint,jsonb,bytea,jsonb,uuid,uuid,timestamptz,text) TO __RUNTIME_ROLE__;
