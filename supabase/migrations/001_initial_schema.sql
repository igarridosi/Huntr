-- ============================================================
-- HUNTR DATABASE SCHEMA v1.0
-- Source of Truth: ARCHITECTURE.md § 2.1
-- Run this migration against your Supabase project.
-- ============================================================

-- Profiles (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);


-- Watchlists
CREATE TABLE public.watchlists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'My Watchlist',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own watchlists"
  ON public.watchlists FOR ALL USING (auth.uid() = user_id);


-- Watchlist Items (join table: watchlist <-> ticker)
CREATE TABLE public.watchlist_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id  UUID NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  ticker        TEXT NOT NULL,
  added_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(watchlist_id, ticker)
);

ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own watchlist items"
  ON public.watchlist_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlists w
      WHERE w.id = watchlist_items.watchlist_id
        AND w.user_id = auth.uid()
    )
  );


-- Trigger: auto-create default watchlist and profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  INSERT INTO public.watchlists (user_id, name) VALUES (NEW.id, 'My Watchlist');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
