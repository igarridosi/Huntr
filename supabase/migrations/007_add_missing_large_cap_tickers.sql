-- ================================================================
-- HUNTR — Add missing large-cap tickers (DUOL + peers)
-- ================================================================
-- Ensures high-visibility tickers are present in search and insights.

INSERT INTO tickers (symbol, name, sector, website, is_active)
VALUES
  ('DUOL', 'Duolingo, Inc.', 'Technology', 'duolingo.com', TRUE),
  ('CRWD', 'CrowdStrike Holdings, Inc.', 'Technology', 'crowdstrike.com', TRUE),
  ('PLTR', 'Palantir Technologies Inc.', 'Technology', 'palantir.com', TRUE),
  ('SNOW', 'Snowflake Inc.', 'Technology', 'snowflake.com', TRUE),
  ('DASH', 'DoorDash, Inc.', 'Consumer Discretionary', 'doordash.com', TRUE)
ON CONFLICT (symbol)
DO UPDATE SET
  name = EXCLUDED.name,
  sector = EXCLUDED.sector,
  website = EXCLUDED.website,
  is_active = TRUE;
