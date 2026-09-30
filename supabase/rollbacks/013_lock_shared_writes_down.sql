-- ─────────────────────────────────────────────────────────
-- 013 down — puts back exactly what 013 removed: the three open write
-- policies, as 002 and 008 created them, and the API roles' write
-- privileges on the four tables. Reopens the hole 013 closed; only for
-- undoing 013 if it broke something, until the cause is fixed.
-- ─────────────────────────────────────────────────────────

BEGIN;

DROP POLICY IF EXISTS tickers_write ON public.tickers;
CREATE POLICY "tickers_write" ON public.tickers FOR ALL USING (true);

DROP POLICY IF EXISTS stock_cache_write ON public.stock_cache;
CREATE POLICY "stock_cache_write" ON public.stock_cache FOR ALL USING (true);

DROP POLICY IF EXISTS quality_scores_write ON public.stock_quality_scores;
CREATE POLICY "quality_scores_write" ON public.stock_quality_scores FOR ALL USING (true);

GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.tickers, public.stock_cache, public.stock_quality_scores
  TO anon, authenticated;

GRANT ALL ON public.analytics_events TO anon, authenticated;

COMMIT;
