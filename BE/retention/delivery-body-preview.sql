-- psql -v retention_at='2026-10-21T00:00:00Z' -f retention/delivery-body-preview.sql
-- Aggregate-only preview; no runtime/provider activation or deletion authority.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT state,count(*) FILTER(WHERE rendered_body IS NOT NULL) AS retained_bodies,
 count(*) FILTER(WHERE rendered_body IS NOT NULL AND state IN('ACCEPTED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED','EXPIRED') AND terminal_at<=:'retention_at'::timestamptz-interval '7 days') AS eligible_bodies
FROM external_job GROUP BY state ORDER BY state;
ROLLBACK;
