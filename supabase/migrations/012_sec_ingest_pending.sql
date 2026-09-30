-- ─────────────────────────────────────────────────────────
-- 012 — per-company retries for the SEC ingest
--
-- A company whose latest filing is not in companyfacts yet, or whose
-- download failed, used to hold the global cursor, and a filing that never
-- gets XBRL (a 10-K/A that only adds exhibits) would have held it for
-- good. The debt is now kept per company: what is owed, since when, how
-- many times it was tried. The cursor moves on; the company is retried
-- every night until it is paid or gives up with an error.
--
-- The pipeline's role already has SELECT, INSERT, UPDATE on the table;
-- table-level grants cover new columns.
-- ─────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.sec_ingest_state
  -- The filing the company owes; NULL when a full load is owed (a company
  -- whose first download failed).
  ADD COLUMN IF NOT EXISTS pending_accession TEXT,
  -- The day it started being owed, in New York; NULL when nothing is owed.
  ADD COLUMN IF NOT EXISTS pending_since DATE,
  ADD COLUMN IF NOT EXISTS pending_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.sec_ingest_state DROP CONSTRAINT IF EXISTS sec_ingest_state_pending_consistent;
ALTER TABLE public.sec_ingest_state ADD CONSTRAINT sec_ingest_state_pending_consistent CHECK (
  (pending_since IS NULL AND pending_accession IS NULL AND pending_attempts = 0)
  OR (pending_since IS NOT NULL AND pending_attempts > 0)
);

-- The nightly run reads the companies with something owed.
CREATE INDEX IF NOT EXISTS sec_ingest_state_pending
  ON public.sec_ingest_state (pending_since)
  WHERE pending_since IS NOT NULL;

COMMIT;
