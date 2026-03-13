-- ================================================================
-- HUNTR — User portfolio state persistence
-- ================================================================
-- Stores the complete portfolio store JSON for each authenticated user.
-- This replaces client-only localStorage persistence for portfolios.

CREATE TABLE IF NOT EXISTS public.user_portfolio_state (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{"portfolios":[],"activePortfolioId":"default"}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_portfolio_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio_state_select_own" ON public.user_portfolio_state;
CREATE POLICY "portfolio_state_select_own"
  ON public.user_portfolio_state
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "portfolio_state_insert_own" ON public.user_portfolio_state;
CREATE POLICY "portfolio_state_insert_own"
  ON public.user_portfolio_state
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "portfolio_state_update_own" ON public.user_portfolio_state;
CREATE POLICY "portfolio_state_update_own"
  ON public.user_portfolio_state
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "portfolio_state_delete_own" ON public.user_portfolio_state;
CREATE POLICY "portfolio_state_delete_own"
  ON public.user_portfolio_state
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_user_portfolio_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_portfolio_state_updated_at ON public.user_portfolio_state;
CREATE TRIGGER trg_user_portfolio_state_updated_at
  BEFORE UPDATE ON public.user_portfolio_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_portfolio_state_updated_at();
