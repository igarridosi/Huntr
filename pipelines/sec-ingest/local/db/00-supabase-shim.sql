-- ─────────────────────────────────────────────────────────
-- LOCAL ONLY. What a Supabase project has before migration 011 and that a
-- plain Postgres does not: the API roles, and `tickers` as migration 002
-- created it (RLS and its policies included), so 011's grants and policies
-- apply exactly as they do in production.
-- ─────────────────────────────────────────────────────────

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

-- Supabase's defaults: the API roles get every table created in public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.tickers (
  symbol     TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL DEFAULT '',
  sector     TEXT    NOT NULL DEFAULT '',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.tickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickers_read" ON public.tickers FOR SELECT USING (true);
CREATE POLICY "tickers_write" ON public.tickers FOR ALL USING (true);
