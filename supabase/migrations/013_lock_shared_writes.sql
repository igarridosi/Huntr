-- ─────────────────────────────────────────────────────────
-- 013 — shared data is written by the server only
--
-- Migrations 002 and 008 created write policies with no TO clause and
-- USING (true): tickers_write, stock_cache_write, quality_scores_write.
-- A policy without TO applies to PUBLIC, anon and authenticated included,
-- and Supabase grants those roles INSERT/UPDATE/DELETE on new tables in
-- public. With the anon key in every browser, anyone could rewrite the
-- Yahoo cache every user reads, the quality scores the screener filters on,
-- or the list of tickers.
--
-- These tables are written by the server only, with the service role,
-- which bypasses RLS and needs no policy (src/lib/supabase/admin.ts, the
-- Vercel crons, the seed scripts). Reads stay open: the read policies and
-- SELECT are kept.
--
-- Deploy the code change first (stock_cache writes through the service
-- role, not the request's client), then apply this. The other way round,
-- cache writes fail quietly until the deploy lands.
-- ─────────────────────────────────────────────────────────

BEGIN;

-- The open write policies.
DROP POLICY IF EXISTS tickers_write ON public.tickers;
DROP POLICY IF EXISTS stock_cache_write ON public.stock_cache;
DROP POLICY IF EXISTS quality_scores_write ON public.stock_quality_scores;

-- A second barrier behind RLS: no write privilege for the API roles.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.tickers, public.stock_cache, public.stock_quality_scores
  FROM anon, authenticated;

-- Reads are what the app and the screener need; kept explicitly so this
-- migration cannot be the reason they stop.
GRANT SELECT ON public.tickers, public.stock_cache, public.stock_quality_scores
  TO anon, authenticated;

-- analytics_events: RLS on and no policy already blocks the API roles; the
-- only writer is the recordEvent Server Action with the service role, and
-- nothing reads it through the API. Same second barrier.
REVOKE ALL ON public.analytics_events FROM anon, authenticated;

COMMIT;
