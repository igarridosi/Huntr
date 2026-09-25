/**
 * Insider activity from SEC EDGAR: the Form 4s an issuer's officers,
 * directors and 10% owners file, read straight from the source.
 *
 * Cost, which is the whole design:
 * - The list of filings comes from the issuer's submissions feed — one
 *   request, refreshed every six hours (a Form 4 is due within two
 *   business days, so nothing is missed by waiting that long).
 * - Each Form 4 never changes once filed, so a parsed filing is kept for
 *   good and only accessions not seen before are fetched on a refresh.
 * - The SEC allows ten requests a second; this stays near five.
 *
 * The parsed result lives in `stock_cache`, not in the fetch cache, which
 * refuses anything over 2 MB.
 */

import { getCachedDataState, setCachedData, withSingleFlight } from "./cache";
import { resolveCIK, SEC_ARCHIVES_URL, SEC_SUBMISSIONS_URL, USER_AGENT } from "./sec-edgar";
import { parseForm4, type Form4Filing } from "@/lib/insiders/form4";
import { summarize, toRows, type InsiderRow, type InsiderSummary } from "@/lib/insiders/activity";

const CACHE_KEY = "insiders-v1";
const FRESH_MS = 6 * 60 * 60 * 1000;
/** A stale copy is served while it refreshes, for up to a month. */
const STALE_MS = 30 * 24 * 60 * 60 * 1000;
/** Two years of filings — twice the window the summary reads. */
const LOOKBACK_DAYS = 730;
/** The most filings read for one company. A cold load costs this many requests. */
export const MAX_FILINGS = 60;
const BATCH = 5;
const BATCH_GAP_MS = 1_100;

export interface InsiderActivity {
  ticker: string;
  cik: string;
  /** Newest first. */
  rows: InsiderRow[];
  summary: InsiderSummary;
  coverage: {
    /** Oldest filing read. */
    from: string | null;
    filings: number;
    /** More Form 4s exist in the lookback than were read. */
    truncated: boolean;
  };
  fetchedAt: string;
}

interface CachedPayload {
  cik: string;
  filings: Form4Filing[];
  truncated: boolean;
  fetchedAt: string;
}

interface Listing {
  accession: string;
  filingDate: string;
  xmlUrl: string;
}

async function sec(url: string, init: RequestInit & { next?: { revalidate: number | false } } = {}): Promise<Response | null> {
  try {
    const r = await fetch(url, { ...init, headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) } });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The Form 4s in the issuer's feed. The feed's primary document points at
 * the XSL-rendered view (`xslF345X06/…xml`); the raw XML sits beside it at
 * the root of the filing, under the same file name.
 */
export function listingsFrom(payload: unknown, cik: string, sinceIso: string): { listings: Listing[]; truncated: boolean } {
  const recent = (payload as { filings?: { recent?: Record<string, string[]> } })?.filings?.recent;
  if (!recent?.form) return { listings: [], truncated: false };
  const all: Listing[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    const form = recent.form[i];
    if (form !== "4" && form !== "4/A") continue;
    const filingDate = recent.filingDate?.[i];
    const accession = recent.accessionNumber?.[i];
    const doc = recent.primaryDocument?.[i];
    if (!filingDate || !accession || !doc || filingDate < sinceIso) continue;
    const file = doc.split("/").pop()!;
    all.push({ accession, filingDate, xmlUrl: `${SEC_ARCHIVES_URL}/${Number(cik)}/${accession.replace(/-/g, "")}/${file}` });
  }
  return { listings: all.slice(0, MAX_FILINGS), truncated: all.length > MAX_FILINGS };
}

async function fetchFiling(l: Listing): Promise<Form4Filing | null> {
  // A filed Form 4 is immutable; the fetch cache may keep it forever.
  const r = await sec(l.xmlUrl, { cache: "force-cache" });
  if (!r) return null;
  return parseForm4(await r.text(), { accession: l.accession, filingDate: l.filingDate });
}

async function refresh(ticker: string, previous: CachedPayload | null): Promise<CachedPayload | null> {
  const cik = previous?.cik ?? (await resolveCIK(ticker));
  if (!cik) return null;

  const feed = await sec(`${SEC_SUBMISSIONS_URL}/CIK${cik}.json`, { headers: { Accept: "application/json" }, next: { revalidate: FRESH_MS / 1000 } });
  if (!feed) return previous;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { listings, truncated } = listingsFrom(await feed.json(), cik, since);

  const known = new Map((previous?.filings ?? []).map((f) => [f.accession, f]));
  const wanted = listings.filter((l) => !known.has(l.accession));

  const fresh: Form4Filing[] = [];
  for (let i = 0; i < wanted.length; i += BATCH) {
    if (i > 0) await sleep(BATCH_GAP_MS);
    const got = await Promise.all(wanted.slice(i, i + BATCH).map(fetchFiling));
    for (const f of got) if (f) fresh.push(f);
  }

  // Keep only what is still inside the lookback, known or new.
  const keep = new Set(listings.map((l) => l.accession));
  const filings = [...fresh, ...[...known.values()].filter((f) => keep.has(f.accession))];
  return { cik, filings, truncated, fetchedAt: new Date().toISOString() };
}

function present(ticker: string, p: CachedPayload): InsiderActivity {
  const rows = toRows(p.filings);
  const dates = p.filings.map((f) => f.filingDate).sort();
  return {
    ticker,
    cik: p.cik,
    rows,
    summary: summarize(rows, p.fetchedAt),
    coverage: { from: dates[0] ?? null, filings: p.filings.length, truncated: p.truncated },
    fetchedAt: p.fetchedAt,
  };
}

/**
 * Insider activity for one ticker, or null when the ticker has no CIK
 * (not an SEC registrant) or EDGAR could not be reached and nothing is
 * cached. An issuer with no Form 4s returns an empty activity, not null.
 */
export async function getInsiderActivity(ticker: string): Promise<InsiderActivity | null> {
  const t = ticker.toUpperCase();
  const cached = await getCachedDataState<CachedPayload>(t, CACHE_KEY, FRESH_MS, STALE_MS);
  if (cached.status === "fresh" && cached.data) return present(t, cached.data);

  const next = await withSingleFlight(`insiders:${t}`, async () => {
    const p = await refresh(t, cached.data ?? null);
    // An issuer with no Form 4s is a real answer, but an empty payload is
    // refused by the cache by design; only non-empty results are stored.
    if (p && p.filings.length > 0) await setCachedData(t, CACHE_KEY, p);
    return p;
  });

  if (next) return present(t, next);
  return cached.data ? present(t, cached.data) : null;
}

/**
 * What is already on file, without touching EDGAR. For views that list
 * many tickers at once, where a cold load per ticker would be a burst of
 * SEC requests each: they show what is cached and load the rest on demand.
 */
export async function getCachedInsiderActivity(ticker: string): Promise<InsiderActivity | null> {
  const t = ticker.toUpperCase();
  const cached = await getCachedDataState<CachedPayload>(t, CACHE_KEY, FRESH_MS, STALE_MS);
  return cached.data ? present(t, cached.data) : null;
}
