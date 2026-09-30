-- ─────────────────────────────────────────────────────────
-- 011 — SEC company facts, ingested nightly by pipelines/sec-ingest
--
-- Only the XBRL concepts the app reads (SEC_CONCEPTS), only reviewed
-- forms, only periods ending in the last three years. Each row is a
-- companyfacts row unchanged, so the app can rebuild the same payload and
-- run the same selection logic on it.
-- ─────────────────────────────────────────────────────────

BEGIN;

-- UNIQUE ... NULLS NOT DISTINCT needs Postgres 15. Fail loudly rather
-- than create a unique index that lets duplicate instants through.
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION '011 needs Postgres 15+ (NULLS NOT DISTINCT); server is %', current_setting('server_version');
  END IF;
END $$;

-- ── Concepts ─────────────────────────────────────────────
-- Stored once; facts refer to them by a two-byte id instead of repeating
-- a 40-character tag in every row and index entry.
CREATE TABLE IF NOT EXISTS public.sec_concepts (
  id        SMALLINT PRIMARY KEY,
  taxonomy  TEXT NOT NULL CHECK (taxonomy IN ('us-gaap', 'dei')),
  name      TEXT NOT NULL,
  UNIQUE (taxonomy, name)
);

-- ── Facts ────────────────────────────────────────────────
-- period_start is NULL for instants (balance-sheet figures), exactly as
-- companyfacts has it. The natural key includes the accession: the same
-- period is filed again as a comparative in later filings, and the app's
-- selection (latest filed, same-filing year-to-date pairs) needs every copy.
CREATE TABLE IF NOT EXISTS public.sec_company_facts (
  cik           INTEGER   NOT NULL,
  concept_id    SMALLINT  NOT NULL REFERENCES public.sec_concepts (id),
  unit          TEXT      NOT NULL,              -- 'USD', 'shares', ...
  period_start  DATE,                            -- NULL for instants
  period_end    DATE      NOT NULL,
  value         NUMERIC   NOT NULL,
  -- NULL kept: the app keeps unlabelled rows (some older filings omit the
  -- form). The list is REVIEWED_FORMS in src/lib/sec/forms.ts; a test
  -- fails if the two ever differ.
  form          TEXT      CHECK (form IS NULL OR form IN ('10-K', '10-Q', '10-K/A', '10-Q/A', '20-F', '40-F')),
  filed         DATE      NOT NULL,
  accession     TEXT      NOT NULL CHECK (accession ~ '^\d{10}-\d{2}-\d{6}$'),
  CHECK (period_start IS NULL OR period_start <= period_end)
) WITH (fillfactor = 90);

-- The natural key, and the arbiter for the loader's
-- INSERT ... ON CONFLICT (cik, concept_id, unit, period_end, period_start, accession).
-- NULLS NOT DISTINCT makes two instants of the same filing collide, as they must.
CREATE UNIQUE INDEX IF NOT EXISTS sec_company_facts_natural_key
  ON public.sec_company_facts (cik, concept_id, unit, period_end, period_start, accession)
  NULLS NOT DISTINCT;

-- Pruning deletes by age.
CREATE INDEX IF NOT EXISTS sec_company_facts_period_end
  ON public.sec_company_facts (period_end);

-- ── Ingest state ─────────────────────────────────────────
-- Per company: the latest filing stored, so a run only fetches companies
-- with something newer and a rerun is a no-op.
CREATE TABLE IF NOT EXISTS public.sec_ingest_state (
  cik              INTEGER PRIMARY KEY,
  ticker           TEXT        NOT NULL,
  last_accession   TEXT,
  last_filed       DATE,
  facts_stored     INTEGER     NOT NULL DEFAULT 0,
  last_run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error       TEXT
);

-- Per run: the last EDGAR daily index fully processed, so a missed night
-- is caught up from here. One row, keyed by a constant.
CREATE TABLE IF NOT EXISTS public.sec_ingest_cursor (
  id                    BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  last_index_date       DATE        NOT NULL,
  last_success_at       TIMESTAMPTZ
);

-- ── Row Level Security ───────────────────────────────────
-- Not readable by anon or authenticated clients. The app reads these on
-- the server with the service role, which bypasses RLS.
ALTER TABLE public.sec_concepts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_company_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_ingest_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_ingest_cursor ENABLE ROW LEVEL SECURITY;

-- A second barrier behind RLS: Supabase grants anon and authenticated
-- access to new tables in public by default. service_role keeps its grants;
-- it is how the app reads these tables on the server.
REVOKE ALL ON public.sec_concepts, public.sec_company_facts, public.sec_ingest_state, public.sec_ingest_cursor
  FROM anon, authenticated;

-- ── The pipeline's role ──────────────────────────────────
-- Login without a password: it is set by hand in the SQL editor
-- (ALTER ROLE huntr_sec_ingest PASSWORD '...') and stored only in Key
-- Vault. No BYPASSRLS, no CREATE, nothing outside these tables.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'huntr_sec_ingest') THEN
    CREATE ROLE huntr_sec_ingest LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS
      CONNECTION LIMIT 2;
  END IF;
END $$;

ALTER ROLE huntr_sec_ingest SET statement_timeout = '60s';

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM huntr_sec_ingest;
REVOKE CREATE ON SCHEMA public FROM huntr_sec_ingest;
GRANT USAGE ON SCHEMA public TO huntr_sec_ingest;

-- The universe it ingests: two columns, read only.
GRANT SELECT (symbol, is_active) ON public.tickers TO huntr_sec_ingest;
-- Its own tables. DELETE on facts only, to prune periods older than the window.
GRANT SELECT ON public.sec_concepts TO huntr_sec_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sec_company_facts TO huntr_sec_ingest;
GRANT SELECT, INSERT, UPDATE ON public.sec_ingest_state TO huntr_sec_ingest;
GRANT SELECT, INSERT, UPDATE ON public.sec_ingest_cursor TO huntr_sec_ingest;

-- RLS applies to this role, so every grant needs a matching policy.
DROP POLICY IF EXISTS sec_ingest_tickers_read ON public.tickers;
CREATE POLICY sec_ingest_tickers_read ON public.tickers
  FOR SELECT TO huntr_sec_ingest USING (true);
DROP POLICY IF EXISTS sec_ingest_concepts_read ON public.sec_concepts;
CREATE POLICY sec_ingest_concepts_read ON public.sec_concepts
  FOR SELECT TO huntr_sec_ingest USING (true);
DROP POLICY IF EXISTS sec_ingest_facts_all ON public.sec_company_facts;
CREATE POLICY sec_ingest_facts_all ON public.sec_company_facts
  FOR ALL TO huntr_sec_ingest USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS sec_ingest_state_all ON public.sec_ingest_state;
CREATE POLICY sec_ingest_state_all ON public.sec_ingest_state
  FOR ALL TO huntr_sec_ingest USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS sec_ingest_cursor_all ON public.sec_ingest_cursor;
CREATE POLICY sec_ingest_cursor_all ON public.sec_ingest_cursor
  FOR ALL TO huntr_sec_ingest USING (true) WITH CHECK (true);

-- ── Seed: the 42 concepts the app reads ──────────────────
INSERT INTO public.sec_concepts (id, taxonomy, name) VALUES
  (1,  'dei',     'EntityCommonStockSharesOutstanding'),
  (2,  'us-gaap', 'WeightedAverageNumberOfDilutedSharesOutstanding'),
  (3,  'us-gaap', 'CashAndCashEquivalentsAtCarryingValue'),
  (4,  'us-gaap', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'),
  (5,  'us-gaap', 'Cash'),
  (6,  'us-gaap', 'RestrictedCashCurrent'),
  (7,  'us-gaap', 'RestrictedCashAndCashEquivalentsAtCarryingValue'),
  (8,  'us-gaap', 'RestrictedCashEquivalentsCurrent'),
  (9,  'us-gaap', 'RestrictedCashNoncurrent'),
  (10, 'us-gaap', 'RestrictedCashAndCashEquivalentsNoncurrent'),
  (11, 'us-gaap', 'LongTermDebtNoncurrent'),
  (12, 'us-gaap', 'LongTermDebtAndCapitalLeaseObligations'),
  (13, 'us-gaap', 'UnsecuredLongTermDebt'),
  (14, 'us-gaap', 'LongTermDebt'),
  (15, 'us-gaap', 'LongTermDebtCurrent'),
  (16, 'us-gaap', 'LongTermDebtAndCapitalLeaseObligationsCurrent'),
  (17, 'us-gaap', 'DebtCurrent'),
  (18, 'us-gaap', 'UnsecuredDebtCurrent'),
  (19, 'us-gaap', 'ShortTermBorrowings'),
  (20, 'us-gaap', 'CommercialPaper'),
  (21, 'us-gaap', 'ShortTermBankLoansAndNotesPayable'),
  (22, 'us-gaap', 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities'),
  (23, 'us-gaap', 'DebtLongtermAndShorttermCombinedAmount'),
  (24, 'us-gaap', 'DebtInstrumentCarryingAmount'),
  (25, 'us-gaap', 'NotesPayable'),
  (26, 'us-gaap', 'Revenues'),
  (27, 'us-gaap', 'RevenueFromContractWithCustomerExcludingAssessedTax'),
  (28, 'us-gaap', 'RevenueFromContractWithCustomerIncludingAssessedTax'),
  (29, 'us-gaap', 'SalesRevenueNet'),
  (30, 'us-gaap', 'OperatingLeaseLiabilityNoncurrent'),
  (31, 'us-gaap', 'OperatingLeaseLiabilityCurrent'),
  (32, 'us-gaap', 'OperatingLeaseExpense'),
  (33, 'us-gaap', 'OperatingLeaseCost'),
  (34, 'us-gaap', 'OperatingLeasePayments'),
  (35, 'us-gaap', 'ShareBasedCompensation'),
  (36, 'us-gaap', 'PaymentsToAcquireBusinessesNetOfCashAcquired'),
  (37, 'us-gaap', 'PaymentsToAcquireBusinessesGross'),
  (38, 'us-gaap', 'ProceedsFromDivestitureOfBusinesses'),
  (39, 'us-gaap', 'ProceedsFromDivestitureOfBusinessesNetOfCashDivested'),
  (40, 'us-gaap', 'ProceedsFromSaleOfBusinessesNetOfCashDivested'),
  (41, 'us-gaap', 'NetCashProvidedByUsedInOperatingActivities'),
  (42, 'us-gaap', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations')
ON CONFLICT (id) DO NOTHING;

COMMIT;
