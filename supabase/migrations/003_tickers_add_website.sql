-- ================================================================
-- HUNTR — Add website domain to tickers
-- ================================================================
-- Stores company domain used to build logo URLs via:
--   https://cdn.tickerlogos.com/{domain}
-- ================================================================

ALTER TABLE tickers
ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_tickers_website
  ON tickers (website);
