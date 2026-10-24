-- Read-only counts for the isolated commercial CSV artifact key; contains no payload or identities.
-- These counts are NOT proof that approval/generation writers have been paused and drained.
BEGIN READ ONLY;
SELECT count(*) FILTER(WHERE artifact IS NOT NULL) AS retained_ciphertexts,
       count(*) FILTER(WHERE artifact IS NOT NULL AND artifact_held) AS held_ciphertexts,
       count(*) FILTER(WHERE state='QUEUED') AS queued_jobs,
       coalesce(sum(octet_length(artifact)::bigint),0) AS retained_ciphertext_bytes
FROM commercial_export;
ROLLBACK;
