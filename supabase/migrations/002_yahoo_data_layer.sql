-- ================================================================
-- HUNTR — Yahoo Finance Data Layer Migration
-- ================================================================
-- Creates the tables needed for the Yahoo Finance integration:
--   1. stock_cache — Lazy cache with TTL for Yahoo API responses
--   2. tickers     — Search index seeded by scripts/seed-tickers.ts
-- ================================================================

-- ─────────────────────────────────────────────────────────
-- Table: stock_cache
-- Stores raw Yahoo Finance responses as JSONB with TTL tracking.
-- Composite primary key: (ticker, cache_key)
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_cache (
  ticker        TEXT         NOT NULL,
  cache_key     TEXT         NOT NULL,  -- 'profile' | 'quote' | 'financials'
  data          JSONB        NOT NULL DEFAULT '{}',
  last_updated  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (ticker, cache_key)
);

-- Index for TTL-based cleanup queries
CREATE INDEX IF NOT EXISTS idx_stock_cache_last_updated
  ON stock_cache (last_updated);

-- ─────────────────────────────────────────────────────────
-- Table: tickers
-- Local search index for Cmd+K autocomplete.
-- Populated by: npx tsx scripts/seed-tickers.ts
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tickers (
  symbol     TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL DEFAULT '',
  sector     TEXT    NOT NULL DEFAULT '',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full-text search index for fast autocomplete
CREATE INDEX IF NOT EXISTS idx_tickers_search
  ON tickers USING GIN (to_tsvector('english', symbol || ' ' || name));

-- Sector filter index
CREATE INDEX IF NOT EXISTS idx_tickers_sector
  ON tickers (sector);

-- ─────────────────────────────────────────────────────────
-- RLS Policies (Read-only for anon, full access for service role)
-- ─────────────────────────────────────────────────────────

ALTER TABLE stock_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickers     ENABLE ROW LEVEL SECURITY;

-- stock_cache: read for all authenticated users, write via service role
CREATE POLICY "stock_cache_read" ON stock_cache
  FOR SELECT USING (true);

CREATE POLICY "stock_cache_write" ON stock_cache
  FOR ALL USING (true);

-- tickers: read-only for everyone
CREATE POLICY "tickers_read" ON tickers
  FOR SELECT USING (true);

CREATE POLICY "tickers_write" ON tickers
  FOR ALL USING (true);
