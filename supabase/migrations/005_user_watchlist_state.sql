-- ================================================================
-- HUNTR — User watchlist state persistence
-- ================================================================
-- Stores watchlist lists + alert preferences per authenticated user.
-- This replaces client-only localStorage persistence for watchlists.

CREATE TABLE IF NOT EXISTS public.user_watchlist_state (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{"lists":[],"customTags":[],"activeListId":"default"}'::jsonb,
  alerts      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_watchlist_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "watchlist_state_select_own" ON public.user_watchlist_state;
CREATE POLICY "watchlist_state_select_own"
  ON public.user_watchlist_state
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "watchlist_state_insert_own" ON public.user_watchlist_state;
CREATE POLICY "watchlist_state_insert_own"
  ON public.user_watchlist_state
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "watchlist_state_update_own" ON public.user_watchlist_state;
CREATE POLICY "watchlist_state_update_own"
  ON public.user_watchlist_state
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "watchlist_state_delete_own" ON public.user_watchlist_state;
CREATE POLICY "watchlist_state_delete_own"
  ON public.user_watchlist_state
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_user_watchlist_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_watchlist_state_updated_at ON public.user_watchlist_state;
CREATE TRIGGER trg_user_watchlist_state_updated_at
  BEFORE UPDATE ON public.user_watchlist_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_watchlist_state_updated_at();
