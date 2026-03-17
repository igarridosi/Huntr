-- ================================================================
-- HUNTR — User DCF scenarios persistence
-- ================================================================
-- Stores Bear/Base/Bull scenario sets per user and ticker.

CREATE TABLE IF NOT EXISTS public.user_dcf_scenarios (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker          TEXT NOT NULL,
  scenarios       JSONB NOT NULL,
  active_scenario TEXT NOT NULL DEFAULT 'base',
  wacc_estimate   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_user_dcf_scenarios_user_updated
  ON public.user_dcf_scenarios (user_id, updated_at DESC);

ALTER TABLE public.user_dcf_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dcf_scenarios_select_own" ON public.user_dcf_scenarios;
CREATE POLICY "dcf_scenarios_select_own"
  ON public.user_dcf_scenarios
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "dcf_scenarios_insert_own" ON public.user_dcf_scenarios;
CREATE POLICY "dcf_scenarios_insert_own"
  ON public.user_dcf_scenarios
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dcf_scenarios_update_own" ON public.user_dcf_scenarios;
CREATE POLICY "dcf_scenarios_update_own"
  ON public.user_dcf_scenarios
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dcf_scenarios_delete_own" ON public.user_dcf_scenarios;
CREATE POLICY "dcf_scenarios_delete_own"
  ON public.user_dcf_scenarios
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_user_dcf_scenarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_dcf_scenarios_updated_at ON public.user_dcf_scenarios;
CREATE TRIGGER trg_user_dcf_scenarios_updated_at
  BEFORE UPDATE ON public.user_dcf_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_dcf_scenarios_updated_at();
