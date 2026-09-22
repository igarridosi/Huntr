import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reading the numbers back. Every aggregate is computed in Postgres
 * (see supabase/migrations/010_analytics_events.sql) and read with the
 * service role: the dashboard never pulls individual events, and the
 * functions are not callable by anon or authenticated.
 */

export interface DailyPoint {
  day: string;
  visitors: number;
  views: number;
  events: number;
}

export interface Totals {
  visitors: number;
  views: number;
  events: number;
  returningVisitors: number;
  signedIn: number;
}

export interface Ranked {
  label: string;
  hits: number;
  visitors: number;
}

export interface SignupWeek {
  week: string;
  signups: number;
}

export interface AnalyticsSummary {
  days: number;
  totals: Totals;
  daily: DailyPoint[];
  paths: Ranked[];
  tickers: Ranked[];
  events: Ranked[];
  signups: SignupWeek[];
  totalUsers: number;
  /** Set when the tables are not there yet — the migration has not run. */
  error: string | null;
}

const EMPTY_TOTALS: Totals = { visitors: 0, views: 0, events: 0, returningVisitors: 0, signedIn: 0 };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

export async function getAnalyticsSummary(days: number): Promise<AnalyticsSummary> {
  const empty: AnalyticsSummary = {
    days,
    totals: EMPTY_TOTALS,
    daily: [],
    paths: [],
    tickers: [],
    events: [],
    signups: [],
    totalUsers: 0,
    error: null,
  };

  try {
    const supabase = createAdminClient();
    const [totals, daily, paths, tickers, events, signups, users] = await Promise.all([
      supabase.rpc("analytics_totals", { p_days: days }),
      supabase.rpc("analytics_daily", { p_days: days }),
      supabase.rpc("analytics_top_paths", { p_days: days, p_limit: 12 }),
      supabase.rpc("analytics_top_tickers", { p_days: days, p_limit: 12 }),
      supabase.rpc("analytics_event_counts", { p_days: days }),
      supabase.rpc("analytics_signups", { p_days: 90 }),
      supabase.rpc("analytics_user_total"),
    ]);

    const failure = [totals, daily, paths, tickers, events, signups, users].find((r) => r.error);
    if (failure?.error) return { ...empty, error: failure.error.message };

    const totalRow = (totals.data as Record<string, unknown>[] | null)?.[0] ?? null;

    return {
      days,
      totals: totalRow
        ? {
            visitors: num(totalRow.visitors),
            views: num(totalRow.views),
            events: num(totalRow.events),
            returningVisitors: num(totalRow.returning_visitors),
            signedIn: num(totalRow.signed_in),
          }
        : EMPTY_TOTALS,
      daily: ((daily.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
        day: String(r.day),
        visitors: num(r.visitors),
        views: num(r.views),
        events: num(r.events),
      })),
      paths: ((paths.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
        label: String(r.path),
        hits: num(r.views),
        visitors: num(r.visitors),
      })),
      tickers: ((tickers.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
        label: String(r.ticker),
        hits: num(r.hits),
        visitors: num(r.visitors),
      })),
      events: ((events.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
        label: String(r.event),
        hits: num(r.hits),
        visitors: num(r.visitors),
      })),
      signups: ((signups.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
        week: String(r.week),
        signups: num(r.signups),
      })),
      totalUsers: num(users.data),
      error: null,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Analytics unavailable" };
  }
}
