-- ================================================================
-- HUNTR — First-party analytics: page views and product events
-- ================================================================
-- One row per event. Written only by the server (service role) from
-- src/app/actions/analytics.ts; no browser ever talks to this table.
--
-- What it does NOT store: no IP address, no user agent, no referrer
-- string, no fingerprint. A visitor is an opaque random id kept in a
-- 30-day httpOnly cookie, so the table can count people without
-- knowing who they are. `user_id` is filled only when the visitor is
-- signed in, and survives nothing: deleting the account deletes it.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  event       TEXT NOT NULL,
  -- Path without query string or hash; NULL for events that are not a view.
  path        TEXT,
  -- The company the event was about, when there is one.
  ticker      TEXT,
  visitor_id  UUID NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Small, event-specific extras (e.g. which check blocked a valuation).
  props       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_created
  ON public.analytics_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor
  ON public.analytics_events (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_ticker
  ON public.analytics_events (ticker, created_at DESC)
  WHERE ticker IS NOT NULL;

-- RLS on with no policy at all: anon and authenticated roles can neither
-- read nor write. The service role bypasses RLS, and it is the only
-- writer and the only reader.
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- Aggregates. The dashboard reads these rather than pulling rows:
-- grouping belongs in the database, and the reader never needs the
-- individual events.
-- ================================================================

-- Visitors and views per day, oldest first.
CREATE OR REPLACE FUNCTION public.analytics_daily(p_days INT DEFAULT 30)
RETURNS TABLE (day DATE, visitors BIGINT, views BIGINT, events BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (created_at AT TIME ZONE 'UTC')::date AS day,
    COUNT(DISTINCT visitor_id)                                  AS visitors,
    COUNT(*) FILTER (WHERE event = 'page_view')                  AS views,
    COUNT(*)                                                     AS events
  FROM public.analytics_events
  WHERE created_at >= NOW() - (p_days || ' days')::interval
  GROUP BY 1
  ORDER BY 1;
$$;

-- Totals for a window: people, views, and how many of those people came back.
CREATE OR REPLACE FUNCTION public.analytics_totals(p_days INT DEFAULT 30)
RETURNS TABLE (visitors BIGINT, views BIGINT, events BIGINT, returning_visitors BIGINT, signed_in BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH windowed AS (
    SELECT * FROM public.analytics_events
    WHERE created_at >= NOW() - (p_days || ' days')::interval
  ),
  per_visitor AS (
    SELECT visitor_id, COUNT(DISTINCT (created_at AT TIME ZONE 'UTC')::date) AS days_seen
    FROM windowed GROUP BY 1
  )
  SELECT
    (SELECT COUNT(*) FROM per_visitor)                                   AS visitors,
    (SELECT COUNT(*) FROM windowed WHERE event = 'page_view')            AS views,
    (SELECT COUNT(*) FROM windowed)                                      AS events,
    (SELECT COUNT(*) FROM per_visitor WHERE days_seen > 1)               AS returning_visitors,
    (SELECT COUNT(DISTINCT user_id) FROM windowed WHERE user_id IS NOT NULL) AS signed_in;
$$;

-- The pages people actually open.
CREATE OR REPLACE FUNCTION public.analytics_top_paths(p_days INT DEFAULT 30, p_limit INT DEFAULT 15)
RETURNS TABLE (path TEXT, views BIGINT, visitors BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
  FROM public.analytics_events
  WHERE event = 'page_view'
    AND path IS NOT NULL
    AND created_at >= NOW() - (p_days || ' days')::interval
  GROUP BY 1
  ORDER BY views DESC
  LIMIT p_limit;
$$;

-- The companies people look up, across every surface that names one.
CREATE OR REPLACE FUNCTION public.analytics_top_tickers(p_days INT DEFAULT 30, p_limit INT DEFAULT 15)
RETURNS TABLE (ticker TEXT, hits BIGINT, visitors BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ticker, COUNT(*) AS hits, COUNT(DISTINCT visitor_id) AS visitors
  FROM public.analytics_events
  WHERE ticker IS NOT NULL
    AND created_at >= NOW() - (p_days || ' days')::interval
  GROUP BY 1
  ORDER BY hits DESC
  LIMIT p_limit;
$$;

-- What people do, not just where they go.
CREATE OR REPLACE FUNCTION public.analytics_event_counts(p_days INT DEFAULT 30)
RETURNS TABLE (event TEXT, hits BIGINT, visitors BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT event, COUNT(*) AS hits, COUNT(DISTINCT visitor_id) AS visitors
  FROM public.analytics_events
  WHERE created_at >= NOW() - (p_days || ' days')::interval
  GROUP BY 1
  ORDER BY hits DESC;
$$;

-- Accounts created per week, from auth itself rather than from an event:
-- a signup that never fired a beacon is still a signup.
CREATE OR REPLACE FUNCTION public.analytics_signups(p_days INT DEFAULT 90)
RETURNS TABLE (week DATE, signups BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week, COUNT(*) AS signups
  FROM auth.users
  WHERE created_at >= NOW() - (p_days || ' days')::interval
  GROUP BY 1
  ORDER BY 1;
$$;

-- Total accounts, for the one number that needs no window.
CREATE OR REPLACE FUNCTION public.analytics_user_total()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COUNT(*) FROM auth.users;
$$;

-- These run as the definer, so take execute away from everyone the
-- dashboard does not use. The service role bypasses grants.
REVOKE EXECUTE ON FUNCTION public.analytics_daily(INT)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.analytics_totals(INT)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.analytics_top_paths(INT, INT)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.analytics_top_tickers(INT, INT)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.analytics_event_counts(INT)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.analytics_signups(INT)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.analytics_user_total()             FROM PUBLIC, anon, authenticated;
