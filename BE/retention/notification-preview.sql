-- Read-only counts; replace the explicit UTC assessment instant when assessing a host.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
WITH assessment AS(SELECT timestamptz '2026-10-21T12:00:00Z' AS now),
cutoff AS(SELECT now,now-interval '2160 hours' AS at FROM assessment),
inbox AS(SELECT w.id FROM inbox_work w CROSS JOIN cutoff c WHERE NOT w.retired
 AND w.state IN('PUBLISHED','SUPPRESSED','EXPIRED') AND w.created_at<=c.at AND w.completed_at<=c.now),
delivery AS(SELECT j.id FROM external_job j CROSS JOIN cutoff c WHERE NOT j.metadata_retired
 AND j.state IN('DELIVERED','FAILED','SUPPRESSED','EXPIRED') AND j.terminal_at<=c.at AND j.created_at<=c.at
 AND j.rendered_body IS NULL AND NOT EXISTS(SELECT 1 FROM email_callback e WHERE e.provider_reference::text=j.provider_reference
 AND NOT e.metadata_retired AND e.received_at>c.at)),
callback AS(SELECT e.id FROM email_callback e CROSS JOIN cutoff c WHERE NOT e.metadata_retired AND e.received_at<=c.at
 AND NOT EXISTS(SELECT 1 FROM external_job j WHERE j.provider_reference=e.provider_reference::text AND NOT j.metadata_retired)
 AND NOT EXISTS(SELECT 1 FROM external_job j WHERE j.channel='EMAIL' AND j.provider_reference IS NULL AND j.state IN('SENDING','ACCEPTED','UNKNOWN')))
SELECT 'inbox' AS family,count(*) AS eligible_payloads FROM inbox
UNION ALL SELECT 'delivery',count(*) FROM delivery
UNION ALL SELECT 'callback',count(*) FROM callback
ORDER BY family;
ROLLBACK;
