-- ================================================================
-- HUNTR — Pre-computed Quality Scores Table
-- Migration 008
-- ================================================================
-- Stores weekly pre-calculated quality scores per ticker so the
-- Stock Screener can filter with a simple SQL WHERE clause instead
-- of running the quality engine inline for 800+ tickers per request.
--
-- Populated by: src/lib/scripts/compute-quality-scores.ts
-- Triggered by: src/app/api/cron/quality-scores/route.ts (weekly cron)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.stock_quality_scores (
  ticker                    TEXT        PRIMARY KEY,
  quality_overall           SMALLINT,
  quality_profitability     SMALLINT,
  quality_financial_health  SMALLINT,
  quality_growth            SMALLINT,
  quality_cash_generation   SMALLINT,
  sector                    TEXT,
  mode                      TEXT,    -- 'standard' | 'deep'
  flags                     TEXT[],
  computed_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes for fast screener WHERE filtering ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_quality_overall
  ON public.stock_quality_scores (quality_overall);

CREATE INDEX IF NOT EXISTS idx_quality_profitability
  ON public.stock_quality_scores (quality_profitability);

CREATE INDEX IF NOT EXISTS idx_quality_financial_health
  ON public.stock_quality_scores (quality_financial_health);

CREATE INDEX IF NOT EXISTS idx_quality_growth
  ON public.stock_quality_scores (quality_growth);

CREATE INDEX IF NOT EXISTS idx_quality_cash_generation
  ON public.stock_quality_scores (quality_cash_generation);

-- Index for staleness checks in the cron job
CREATE INDEX IF NOT EXISTS idx_quality_computed_at
  ON public.stock_quality_scores (computed_at);

-- ─── RLS Policies ────────────────────────────────────────────────────────────

ALTER TABLE public.stock_quality_scores ENABLE ROW LEVEL SECURITY;

-- Read access for all (screener needs to read scores without auth)
CREATE POLICY "quality_scores_read" ON public.stock_quality_scores
  FOR SELECT USING (true);

-- Write via service role (cron job uses createAdminClient)
CREATE POLICY "quality_scores_write" ON public.stock_quality_scores
  FOR ALL USING (true);
