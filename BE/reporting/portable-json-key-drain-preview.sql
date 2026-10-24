-- Schema70: read-only counts for the isolated portable JSON artifact key; no payload or identities.
-- Require separately verified writer stop/drain before interpreting an empty inventory for rotation.
BEGIN READ ONLY;
SELECT count(*) FILTER(WHERE artifact IS NOT NULL) AS retained_ciphertexts,
       count(*) FILTER(WHERE artifact IS NOT NULL AND artifact_held) AS held_ciphertexts,
       count(*) FILTER(WHERE state='QUEUED') AS queued_jobs,
       coalesce(sum(octet_length(artifact)::bigint),0) AS retained_ciphertext_bytes
FROM privacy_export_job;
ROLLBACK;
