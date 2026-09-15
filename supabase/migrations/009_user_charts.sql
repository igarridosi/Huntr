-- ================================================================
-- HUNTR — Chart Builder: saved charts per user
-- ================================================================
-- One row per saved chart. `spec` is the versioned ChartSpec JSON the
-- builder reads and writes (src/lib/chart-builder/spec.ts); the server
-- never interprets it. Mirrors 006_user_dcf_scenarios for RLS + trigger.

CREATE TABLE IF NOT EXISTS public.user_charts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  spec        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_charts_user_updated
  ON public.user_charts (user_id, updated_at DESC);

ALTER TABLE public.user_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_charts_select_own" ON public.user_charts;
CREATE POLICY "user_charts_select_own"
  ON public.user_charts
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_charts_insert_own" ON public.user_charts;
CREATE POLICY "user_charts_insert_own"
  ON public.user_charts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_charts_update_own" ON public.user_charts;
CREATE POLICY "user_charts_update_own"
  ON public.user_charts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_charts_delete_own" ON public.user_charts;
CREATE POLICY "user_charts_delete_own"
  ON public.user_charts
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_user_charts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_charts_updated_at ON public.user_charts;
CREATE TRIGGER trg_user_charts_updated_at
  BEFORE UPDATE ON public.user_charts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_charts_updated_at();
