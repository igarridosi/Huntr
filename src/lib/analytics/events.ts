/**
 * What the site is allowed to record about itself.
 *
 * Every event that reaches the database passes through `parseEvent`
 * first: an unknown name, an oversized payload or a path carrying a
 * query string is dropped rather than stored. The list is deliberately
 * short — a measurement you never read is a liability, not an asset.
 */
export const ANALYTICS_EVENTS = [
  /** A page was opened. Carries `path`, and `ticker` on a company page. */
  "page_view",
  /** A valuation was computed and shown. */
  "valuation_run",
  /** The checks withheld the value; `props.reasons` says which. */
  "valuation_blocked",
  /** The reader uncovered a withheld value after reading the checks. */
  "valuation_uncovered",
  /** A valuation was exported as JSON. */
  "valuation_export",
  /** A chart was saved in the Chart Builder. */
  "chart_saved",
  /** A chart was exported as PNG. */
  "chart_export",
  /** A ticker was opened from the search box. */
  "search_open",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsInput {
  event: AnalyticsEvent;
  path?: string | null;
  ticker?: string | null;
  props?: Record<string, unknown> | null;
}

export interface AnalyticsRow {
  event: AnalyticsEvent;
  path: string | null;
  ticker: string | null;
  props: Record<string, unknown> | null;
}

const EVENTS = new Set<string>(ANALYTICS_EVENTS);
const TICKER = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;
const MAX_PATH = 200;
const MAX_PROP_KEYS = 8;
const MAX_PROP_STRING = 120;

/**
 * A path as it will be stored: no origin, no query string, no hash, no
 * trailing slash. Query strings are where personal data leaks into
 * analytics — a saved chart id, an email in a magic link — so they are
 * cut rather than sanitised.
 */
export function normalizePath(raw: string): string | null {
  const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const cut = withoutOrigin.split(/[?#]/)[0].trim();
  if (!cut.startsWith("/")) return null;
  const trimmed = cut.length > 1 ? cut.replace(/\/+$/, "") : cut;
  return (trimmed || "/").slice(0, MAX_PATH);
}

/**
 * Props are kept small and flat on purpose: a handful of short scalars
 * that answer a question the columns cannot. Anything else is dropped.
 */
function normalizeProps(raw: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_PROP_KEYS) break;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string" && value.length > 0) out[key] = value.slice(0, MAX_PROP_STRING);
    else if (Array.isArray(value)) {
      const items = value.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, MAX_PROP_KEYS).map((v) => v.slice(0, MAX_PROP_STRING));
      if (items.length > 0) out[key] = items;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Validate one event from the browser. Returns null when it should not
 * be stored, which the caller treats as "do nothing" — analytics never
 * fails a request it is only observing.
 */
export function parseEvent(raw: unknown): AnalyticsRow | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;

  const event = typeof input.event === "string" ? input.event : null;
  if (!event || !EVENTS.has(event)) return null;

  const path = typeof input.path === "string" ? normalizePath(input.path) : null;
  if (event === "page_view" && !path) return null;

  const rawTicker = typeof input.ticker === "string" ? input.ticker.trim().toUpperCase() : null;
  const ticker = rawTicker && TICKER.test(rawTicker) ? rawTicker : null;

  const props = input.props && typeof input.props === "object" && !Array.isArray(input.props) ? normalizeProps(input.props as Record<string, unknown>) : null;

  return { event: event as AnalyticsEvent, path, ticker, props };
}

/** Paths whose traffic is mine, not a reader's, and so is not counted. */
const NOT_COUNTED = ["/app/admin"];

export function isCountedPath(path: string): boolean {
  return !NOT_COUNTED.some((p) => path === p || path.startsWith(`${p}/`));
}
