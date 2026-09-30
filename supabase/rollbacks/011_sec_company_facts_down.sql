-- ─────────────────────────────────────────────────────────
-- 011 down — removes everything 011 created, and nothing else.
--
-- The only change 011 makes outside its own objects is the policy
-- sec_ingest_tickers_read and the column grant on public.tickers; both go.
-- Close the pipeline's connections first (stop the Function, or wait for
-- the nightly run to end): a role with open sessions cannot be dropped.
-- ─────────────────────────────────────────────────────────

BEGIN;

-- The existing table: its policy and grants back to what they were.
DROP POLICY IF EXISTS sec_ingest_tickers_read ON public.tickers;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'huntr_sec_ingest') THEN
    REVOKE ALL ON public.tickers FROM huntr_sec_ingest;
    REVOKE SELECT (symbol, is_active) ON public.tickers FROM huntr_sec_ingest;
    REVOKE USAGE ON SCHEMA public FROM huntr_sec_ingest;
  END IF;
END $$;

-- The four tables. Their policies and grants go with them.
DROP TABLE IF EXISTS public.sec_company_facts;
DROP TABLE IF EXISTS public.sec_concepts;
DROP TABLE IF EXISTS public.sec_ingest_state;
DROP TABLE IF EXISTS public.sec_ingest_cursor;

-- The role. Nothing is left that it owns or is granted.
DROP ROLE IF EXISTS huntr_sec_ingest;

COMMIT;
