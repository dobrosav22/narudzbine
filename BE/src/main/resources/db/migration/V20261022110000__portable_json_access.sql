-- Fixed technical expiry remains available when new export actions and workers are disabled.
CREATE FUNCTION expire_privacy_exports(source_case uuid,at_time timestamptz) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE job public.privacy_export_job%ROWTYPE; preserved boolean; affected integer:=0;
BEGIN
 IF source_case IS NULL OR at_time IS NULL THEN RAISE EXCEPTION 'Explicit expiry scope and time required';END IF;
 FOR job IN SELECT * FROM public.privacy_export_job WHERE case_id=source_case
 AND((state='QUEUED' AND created_at+interval '24 hours'<=at_time) OR(state='READY' AND expires_at<=at_time)) ORDER BY generation FOR UPDATE LOOP
  IF job.state='QUEUED' THEN
   UPDATE public.privacy_export_job SET state='EXPIRED',revision=revision+1,updated_at=at_time,expires_at=created_at+interval '24 hours' WHERE id=job.id;
  ELSE
   preserved:=public.retention_preservation_active();
   UPDATE public.privacy_export_job SET state='EXPIRED',revision=revision+1,updated_at=at_time,
    artifact_held=preserved,artifact=CASE WHEN preserved THEN artifact ELSE NULL END,digest=CASE WHEN preserved THEN digest ELSE NULL END WHERE id=job.id;
  END IF;
  affected:=affected+1;
 END LOOP;
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION expire_privacy_exports(uuid,timestamptz) FROM PUBLIC;
CREATE VIEW privacy_export_metadata AS SELECT id,generation,case_id,organization_id,country,state,revision,manifest_version,
 created_at,expires_at,failure_code,byte_count,record_count,approved_by,approval_digest,original_response FROM privacy_export_job;
CREATE FUNCTION owned_privacy_export(source_case uuid,job_id uuid,actor uuid,session_id uuid,transport_name text,org uuid,country_code text,at_time timestamptz)
RETURNS SETOF public.privacy_export_metadata LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.account_identity a JOIN public.business_account b ON b.id=a.id JOIN public.organization o ON o.id=b.organization_id JOIN public.application_session s ON s.account_id=a.id
 WHERE a.id=actor AND b.organization_id=org AND o.country=country_code AND b.role IN('OWNER','ADMIN') AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending
 AND s.id=session_id AND s.transport=transport_name AND s.revoked_at IS NULL AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation
 AND s.auth_at<=at_time AND at_time<s.auth_at+interval '300 seconds' AND at_time<s.absolute_expires_at FOR SHARE OF a,b,o,s) THEN RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.privacy_export_job WHERE case_id=source_case AND requester_id=actor AND organization_id=org AND country=country_code AND(job_id IS NULL OR id=job_id)) THEN RETURN;END IF;
 PERFORM public.expire_privacy_exports(source_case,at_time);
 RETURN QUERY SELECT m.* FROM public.privacy_export_metadata m JOIN public.privacy_export_job j ON j.id=m.id
 WHERE j.case_id=source_case AND j.requester_id=actor AND j.organization_id=org AND j.country=country_code AND(job_id IS NULL OR j.id=job_id)
 ORDER BY j.generation DESC LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION owned_privacy_export(uuid,uuid,uuid,uuid,text,uuid,text,timestamptz) FROM PUBLIC;
CREATE FUNCTION disclose_privacy_export(source_case uuid,job_id uuid,actor uuid,session_id uuid,transport_name text,org uuid,country_code text,at_time timestamptz,audit_id uuid,request_id uuid)
RETURNS TABLE(ciphertext bytea,sha256 bytea,bytes integer,failure text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE selected public.privacy_export_metadata%ROWTYPE; job public.privacy_export_job%ROWTYPE;
BEGIN
 SELECT * INTO selected FROM public.owned_privacy_export(source_case,job_id,actor,session_id,transport_name,org,country_code,at_time);
 IF NOT FOUND THEN RETURN;END IF;
 SELECT * INTO STRICT job FROM public.privacy_export_job WHERE id=selected.id FOR UPDATE;
 IF job.state<>'READY' THEN RETURN QUERY SELECT NULL::bytea,NULL::bytea,NULL::integer,CASE WHEN job.state='EXPIRED' THEN 'EXPORT_EXPIRED' ELSE 'INVALID_STATE' END;RETURN;END IF;
 INSERT INTO public.audit_event(id,actor_type,actor_id,organization_id,country,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields)
 VALUES(audit_id,'BUSINESS',actor,org,country_code,'PRIVACY_EXPORT_DOWNLOADED','PRIVACY_EXPORT',job.id,'SUCCESS',request_id,at_time,ARRAY['content']);
 IF job.disclosed_at IS NULL THEN
  UPDATE public.privacy_export_job SET revision=revision+1,updated_at=at_time,disclosed_at=at_time,disclosure_session=session_id,disclosure_transport=transport_name,disclosure_audit_id=audit_id WHERE id=job.id;
 END IF;
 RETURN QUERY SELECT job.artifact,job.digest,job.byte_count,NULL::text;
END $$;
REVOKE ALL ON FUNCTION disclose_privacy_export(uuid,uuid,uuid,uuid,text,uuid,text,timestamptz,uuid,uuid) FROM PUBLIC;
UPDATE backend_schema_version SET version=71 WHERE id=1;
