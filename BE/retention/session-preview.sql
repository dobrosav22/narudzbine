-- Read-only aggregate; replace the literal with an explicit UTC assessment instant.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
WITH cutoff AS(SELECT timestamptz '2026-10-21T12:00:00Z'-interval '720 hours' AS at), aged AS(
 SELECT s.id FROM application_session s JOIN account_identity a ON a.id=s.account_id CROSS JOIN cutoff c
 WHERE LEAST(s.absolute_expires_at,s.revoked_at,s.last_qualified_activity_at+
 CASE WHEN a.kind='PLATFORM_ADMIN' THEN interval '30 minutes' ELSE interval '168 hours' END)<=c.at
), classified AS(
 SELECT s.id,EXISTS(SELECT 1 FROM credential_operation o CROSS JOIN cutoff c WHERE o.current_session_id=s.id
 AND(o.state NOT IN('COMPLETED','REJECTED') OR o.updated_at>c.at)) OR
 EXISTS(SELECT 1 FROM external_challenge f CROSS JOIN cutoff c WHERE f.original_session_id=s.id
 AND(f.state='CLAIMED' OR f.expires_at>c.at OR f.created_at>c.at)) AS deferred FROM aged s
) SELECT count(*) FILTER(WHERE NOT deferred) AS eligible_sessions,count(*) FILTER(WHERE deferred) AS deferred_work FROM classified;
ROLLBACK;
