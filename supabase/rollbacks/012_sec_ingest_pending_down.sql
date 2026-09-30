-- 012 down — removes the per-company retry columns and nothing else.

BEGIN;

DROP INDEX IF EXISTS public.sec_ingest_state_pending;
ALTER TABLE public.sec_ingest_state DROP CONSTRAINT IF EXISTS sec_ingest_state_pending_consistent;
ALTER TABLE public.sec_ingest_state
  DROP COLUMN IF EXISTS pending_attempts,
  DROP COLUMN IF EXISTS pending_since,
  DROP COLUMN IF EXISTS pending_accession;

COMMIT;
