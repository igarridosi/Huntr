/**
 * Yahoo Finance Data Service.
 *
 * Server-only module — uses yahoo-finance2 which requires Node.js.
 * All calls go through the Supabase cache layer (24h TTL) to avoid
 * hitting Yahoo rate limits.
 *
 * Architecture:
 *   1. Check Supabase cache for existing data.
 *   2. On miss/stale → call yahoo-finance2 → map to domain types → cache.
 *   3. Return clean domain types to the caller.
 *
 * This file should only be imported in Server Components, Server Actions,
 * or API Route Handlers — NEVER in Client Components.
 */

import YahooFinance from "yahoo-finance2";
import type {
  YahooQuoteSummaryResult,
  TimeSeriesFinancialsCache,
  FundamentalsTimeSeriesRow,
} from "@/types/yahoo";
import type {
  StockProfile,
  StockQuote,
  MarketIndexQuote,
  EarningsHistoryPoint,
  EarningsInsight,
} from "@/types/stock";
import type { CompanyFinancials } from "@/types/financials";
import { buildTickerLogoUrl } from "@/lib/logo";
import {
  mapToStockProfile,
  mapToStockQuote,
  mapTimeSeriesFinancials,
} from "./mappers";
import {
  getCachedData,
  getCachedDataState,
  setCachedData,
  withSingleFlight,
} from "./cache";

// ─────────────────────────────────────────────────────────
// yahoo-finance2 v3 requires instantiation
// ─────────────────────────────────────────────────────────

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

type YahooHistoricalClient = {
  historical: (
    symbol: string,
    options: { period1: string; period2: string; interval: string }
  ) => Promise<unknown>;
};

const yahooHistoricalClient = yahooFinance as unknown as YahooHistoricalClient;

const SUPPRESSED_YAHOO_MESSAGES = [
  "Could not determine entry type",
  "historical() is deprecated",
  "Using historical() is deprecated",
  "deprecated historical",
] as const;

function isSuppressedYahooMessage(args: unknown[]): boolean {
  const first = args[0];
  if (typeof first !== "string") return false;
  const message = first.toLowerCase();
  return SUPPRESSED_YAHOO_MESSAGES.some((entry) =>
    message.includes(entry.toLowerCase())
  );
}

async function withSuppressedYahooWarnings<T>(operation: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    if (isSuppressedYahooMessage(args)) return;
    originalLog(...args);
  };

  console.warn = (...args: unknown[]) => {
    if (isSuppressedYahooMessage(args)) return;
    originalWarn(...args);
  };

  try {
    return await operation();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

// ─────────────────────────────────────────────────────────
// Module sets for each data type
// ─────────────────────────────────────────────────────────

/** Modules needed for StockProfile */
const PROFILE_MODULES = [
  "price",
  "summaryProfile",
] as const;

/** Modules needed for StockQuote */
const QUOTE_MODULES = [
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "calendarEvents",
  "financialData",
] as const;

/** Combined profile + quote modules (for getFullStockData) */
const PROFILE_QUOTE_MODULES = [
  ...new Set([...PROFILE_MODULES, ...QUOTE_MODULES]),
] as const;

const EARNINGS_INSIGHT_MODULES = [
  "price",
  "summaryProfile",
  "calendarEvents",
  "earnings",
  "earningsHistory",
  "earningsTrend",
  "financialData",
] as const;

// ─────────────────────────────────────────────────────────
// Cache TTLs (in ms)
// ─────────────────────────────────────────────────────────

const TTL = {
  PROFILE: 7 * 24 * 60 * 60 * 1000,   // 7 days — rarely changes
  QUOTE: 5 * 60 * 1000,                // 5 minutes — price data
  INDICES: 10 * 1000,                  // 10 seconds — market indices (near real-time)
  PERFORMANCE: 30 * 60 * 1000,         // 30 minutes — period performance
  INTRADAY_TREND: 2 * 60 * 1000,       // 2 minutes — watchlist sparkline
  BUYBACK: 24 * 60 * 60 * 1000,        // 24 hours — capital allocation changes slowly
  EARNINGS_INSIGHT: 8 * 60 * 60 * 1000, // 8 hours — estimates/last results
  FINANCIALS: 24 * 60 * 60 * 1000,     // 24 hours — earnings cycle
  FINANCIALS_ALPHA: 12 * 60 * 60 * 1000, // 12 hours — refresh quickly after earnings releases
} as const;

const SWR = {
  PROFILE: 30 * 24 * 60 * 60 * 1000,       // Serve stale profile while refreshing for up to 30 days.
  QUOTE: 60 * 1000,                         // Keep quote responsive during refresh spikes.
  INDICES: 30 * 1000,                       // Avoid blocking header on tiny expiry windows.
  FINANCIALS: 7 * 24 * 60 * 60 * 1000,      // Reserved for optional non-KPI Yahoo financial cache flows.
  FINANCIALS_ALPHA: 24 * 60 * 60 * 1000,    // AlphaVantage cache used as KPI source of truth.
} as const;

const MARKET_INDICES = [
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
] as const;

interface SwrResourceOptions<T> {
  ticker: string;
  cacheKey: string;
  ttlMs: number;
  staleWhileRevalidateMs: number;
  fetchFresh: () => Promise<T | null>;
  isUsable?: (value: T | null) => value is T;
  onRefreshError?: (error: unknown) => void;
}

function hasValue<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

async function resolveWithSWR<T>(options: SwrResourceOptions<T>): Promise<T | null> {
  const normalizedTicker = options.ticker.toUpperCase();
  const isUsable = options.isUsable ?? ((value: T | null): value is T => hasValue(value));

  const cached = await getCachedDataState<T>(
    normalizedTicker,
    options.cacheKey,
    options.ttlMs,
    options.staleWhileRevalidateMs
  );

  const refresh = async (): Promise<T | null> =>
    withSingleFlight(`${normalizedTicker}:${options.cacheKey}:refresh`, async () => {
      try {
        const fresh = await options.fetchFresh();
        if (isUsable(fresh)) {
          await setCachedData(normalizedTicker, options.cacheKey, fresh);
          return fresh;
        }
        return null;
      } catch (error) {
        options.onRefreshError?.(error);
        return null;
      }
    });

  if (cached.status === "fresh" && isUsable(cached.data)) {
    return cached.data;
  }

  if (cached.status === "stale" && isUsable(cached.data)) {
    void refresh();
    return cached.data;
  }

  const fresh = await refresh();
  if (isUsable(fresh)) return fresh;

  return isUsable(cached.data) ? cached.data : null;
}

// ─────────────────────────────────────────────────────────
// Internal: Raw Yahoo fetcher
// ─────────────────────────────────────────────────────────

/**
 * Fetch quoteSummary from Yahoo for the given modules.
 * Returns the raw YahooQuoteSummaryResult (typed to our subset).
 */
async function fetchFromYahoo(
  ticker: string,
  modules: readonly string[]
): Promise<YahooQuoteSummaryResult> {
  const result = await yahooFinance.quoteSummary(ticker, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    modules: modules as any,
  });

  // yahoo-finance2 returns the result directly as a typed object
  return result as unknown as YahooQuoteSummaryResult;
}

// ─────────────────────────────────────────────────────────
// Internal: Yahoo financials (fundamentalsTimeSeries)
// ─────────────────────────────────────────────────────────

async function fetchTimeSeriesModule(
  ticker: string,
  module: string,
  periodType: "annual" | "quarterly"
): Promise<FundamentalsTimeSeriesRow[]> {
  try {
    const now = new Date();
    const period2 = `${now.getFullYear() + 1}-12-31`;

    const result: unknown = await withSuppressedYahooWarnings(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (yahooFinance as any).fundamentalsTimeSeries(
        ticker,
        {
          period1: "2005-01-01",
          period2,
          type: periodType,
          module,
        },
        { validateResult: false }
      );
    });

    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error(
      `[Yahoo] fundamentalsTimeSeries(${ticker}, ${module}, ${periodType}) failed:`,
      error
    );
    return [];
  }
}

async function fetchAllFinancialTimeSeries(
  ticker: string
): Promise<TimeSeriesFinancialsCache> {
  const [
    incomeAnnual,
    incomeQuarterly,
    balanceAnnual,
    balanceQuarterly,
    cashflowAnnual,
    cashflowQuarterly,
  ] = await Promise.all([
    fetchTimeSeriesModule(ticker, "financials", "annual"),
    fetchTimeSeriesModule(ticker, "financials", "quarterly"),
    fetchTimeSeriesModule(ticker, "balance-sheet", "annual"),
    fetchTimeSeriesModule(ticker, "balance-sheet", "quarterly"),
    fetchTimeSeriesModule(ticker, "cash-flow", "annual"),
    fetchTimeSeriesModule(ticker, "cash-flow", "quarterly"),
  ]);

  return {
    income: { annual: incomeAnnual, quarterly: incomeQuarterly },
    balance: { annual: balanceAnnual, quarterly: balanceQuarterly },
    cashflow: { annual: cashflowAnnual, quarterly: cashflowQuarterly },
  };
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

/**
 * Get the stock profile for a ticker.
 * Checks cache first; on miss, fetches from Yahoo and caches.
 *
 * @param ticker - Stock symbol (e.g. "AAPL", "MSFT")
 * @returns StockProfile or null if ticker not found
 */
export async function getProfile(ticker: string): Promise<StockProfile | null> {
  const key = ticker.toUpperCase();

  const raw = await resolveWithSWR<YahooQuoteSummaryResult>({
    ticker: key,
    cacheKey: "profile",
    ttlMs: TTL.PROFILE,
    staleWhileRevalidateMs: SWR.PROFILE,
    fetchFresh: () => fetchFromYahoo(key, PROFILE_MODULES),
    onRefreshError: (error) => {
      console.error(`[Yahoo] Failed to fetch profile for ${key}:`, error);
    },
  });

  return raw ? mapToStockProfile(key, raw) : null;
}

/**
 * Get the stock price/quote for a ticker.
 * Uses shorter TTL (5 min) since price data changes frequently.
 *
 * @param ticker - Stock symbol
 * @returns StockQuote or null if not found
 */
export async function getPrice(ticker: string): Promise<StockQuote | null> {
  const key = ticker.toUpperCase();

  const raw = await resolveWithSWR<YahooQuoteSummaryResult>({
    ticker: key,
    cacheKey: "quote",
    ttlMs: TTL.QUOTE,
    staleWhileRevalidateMs: SWR.QUOTE,
    fetchFresh: () => fetchFromYahoo(key, QUOTE_MODULES),
    onRefreshError: (error) => {
      console.error(`[Yahoo] Failed to fetch quote for ${key}:`, error);
    },
  });

  return raw ? mapToStockQuote(key, raw) : null;
}

/**
 * Get full financial statements (Income, Balance, CashFlow) for a ticker.
 * KPI source of truth is AlphaVantage only.
 * If AlphaVantage is unavailable, returns null (no Yahoo fallback for KPI integrity).
 *
 * @param ticker - Stock symbol
 * @returns CompanyFinancials or null if not found
 */
export async function getFinancials(
  ticker: string
): Promise<CompanyFinancials | null> {
  const key = ticker.toUpperCase();
  const isTimeSeriesShape = (
    value: TimeSeriesFinancialsCache | null
  ): value is TimeSeriesFinancialsCache => {
    return (
      value !== null &&
      Array.isArray(value.income?.annual) &&
      Array.isArray(value.income?.quarterly) &&
      Array.isArray(value.balance?.annual) &&
      Array.isArray(value.balance?.quarterly) &&
      Array.isArray(value.cashflow?.annual) &&
      Array.isArray(value.cashflow?.quarterly)
    );
  };

  const yahooRaw = await resolveWithSWR<TimeSeriesFinancialsCache>({
    ticker: key,
    cacheKey: "financials-v2",
    ttlMs: TTL.FINANCIALS,
    staleWhileRevalidateMs: SWR.FINANCIALS,
    fetchFresh: async () => fetchAllFinancialTimeSeries(key),
    isUsable: isTimeSeriesShape,
    onRefreshError: (error) => {
      console.error(`[Yahoo] Failed to fetch financials for ${key}:`, error);
    },
  });

  return yahooRaw ? mapTimeSeriesFinancials(key, yahooRaw) : null;
}

/**
 * Fetch ALL data at once (profile + quote + financials).
 * Profile/Quote use quoteSummary; Financials use fundamentalsTimeSeries.
 * Both run in parallel for maximum efficiency.
 *
 * Useful for the initial load of a ticker detail page.
 *
 * @param ticker - Stock symbol
 * @returns Object with profile, quote, and financials (any can be null on partial failure)
 */
export async function getFullStockData(ticker: string): Promise<{
  profile: StockProfile | null;
  quote: StockQuote | null;
  financials: CompanyFinancials | null;
}> {
  const key = ticker.toUpperCase();

  const refreshProfileQuote = async (): Promise<YahooQuoteSummaryResult | null> => {
    return withSingleFlight(`${key}:profile-quote:refresh`, async () => {
      try {
        const profileQuoteRaw = await fetchFromYahoo(key, PROFILE_QUOTE_MODULES);
        await Promise.all([
          setCachedData(key, "profile", profileQuoteRaw),
          setCachedData(key, "quote", profileQuoteRaw),
        ]);
        return profileQuoteRaw;
      } catch (error) {
        console.error(`[Yahoo] Failed to refresh full payload for ${key}:`, error);
        return null;
      }
    });
  };

  try {
    const [profileLookup, quoteLookup, financials] = await Promise.all([
      getCachedDataState<YahooQuoteSummaryResult>(
        key,
        "profile",
        TTL.PROFILE,
        SWR.PROFILE
      ),
      getCachedDataState<YahooQuoteSummaryResult>(
        key,
        "quote",
        TTL.QUOTE,
        SWR.QUOTE
      ),
      getFinancials(key),
    ]);

    let profileRaw = profileLookup.data;
    let quoteRaw = quoteLookup.data;

    const hasStaleData =
      profileLookup.status === "stale" || quoteLookup.status === "stale";
    if (hasStaleData && profileRaw && quoteRaw) {
      void refreshProfileQuote();
    }

    const requiresBlockingRefresh =
      profileLookup.status === "miss" ||
      quoteLookup.status === "miss" ||
      !profileRaw ||
      !quoteRaw;

    if (requiresBlockingRefresh) {
      const refreshed = await refreshProfileQuote();
      profileRaw = profileRaw ?? refreshed;
      quoteRaw = quoteRaw ?? refreshed;
    }

    return {
      profile: profileRaw ? mapToStockProfile(key, profileRaw) : null,
      quote: quoteRaw ? mapToStockQuote(key, quoteRaw) : null,
      financials,
    };
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch full data for ${key}:`, error);
    return { profile: null, quote: null, financials: null };
  }
}

/**
 * Batch-fetch quotes for multiple tickers using yahoo-finance2's quote().
 * Much more efficient than calling getPrice() for each ticker individually.
 *
 * @param tickers - Array of stock symbols
 * @returns Array of StockQuote objects (only successfully fetched ones)
 */
export async function getBatchQuotes(
  tickers: string[]
): Promise<StockQuote[]> {
  if (tickers.length === 0) return [];

  const toTimestampMs = (value: unknown): number | null => {
    if (value == null) return null;
    if (typeof value === "number") {
      const ms = value < 1e12 ? value * 1000 : value;
      return Number.isFinite(ms) ? ms : null;
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.getTime();
    }
    if (typeof value === "string") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    }
    return null;
  };

  const toIsoDate = (value: unknown): string | null => {
    if (value == null) return null;
    if (typeof value === "number") {
      const ms = value < 1e12 ? value * 1000 : value;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString().split("T")[0];
    }
    if (typeof value === "string") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
    }
    return null;
  };

  const extractNextEarningsDate = (row: Record<string, unknown>): string | null => {
    const now = Date.now();

    const candidates = [
      row.earningsTimestampStart,
      row.earningsTimestampEnd,
      row.earningsTimestamp,
    ]
      .map((value) => toIsoDate(value))
      .filter((value): value is string => !!value)
      .map((value) => new Date(`${value}T00:00:00Z`))
      .filter((value) => !Number.isNaN(value.getTime()));

    const future = candidates
      .filter((value) => value.getTime() >= now - 12 * 60 * 60 * 1000)
      .sort((a, b) => a.getTime() - b.getTime());

    if (future.length > 0) {
      return future[0].toISOString().split("T")[0];
    }

    const earningsDate = row.earningsDate;
    if (Array.isArray(earningsDate)) {
      const parsed = earningsDate
        .map((entry) => toIsoDate(entry))
        .filter((entry): entry is string => !!entry)
        .sort();

      const future = parsed.find((entry) => {
        const ts = new Date(`${entry}T00:00:00Z`).getTime();
        return Number.isFinite(ts) && ts >= now - 12 * 60 * 60 * 1000;
      });

      return future ?? parsed[parsed.length - 1] ?? null;
    }

    return candidates.length > 0
      ? candidates.sort((a, b) => b.getTime() - a.getTime())[0]
          .toISOString()
          .split("T")[0]
      : toIsoDate(earningsDate);
  };

  const extractEarningsTiming = (
    row: Record<string, unknown>
  ): "Before Open" | "After Close" | "Time TBD" => {
    const now = Date.now();
    const candidates = [
      toTimestampMs(row.earningsTimestampStart),
      toTimestampMs(row.earningsTimestampEnd),
      toTimestampMs(row.earningsTimestamp),
    ].filter((value): value is number => value != null);

    if (candidates.length === 0) return "Time TBD";

    const future = candidates
      .filter((value) => value >= now - 12 * 60 * 60 * 1000)
      .sort((a, b) => a - b);

    const pickedTs = future[0] ?? candidates.sort((a, b) => b - a)[0];
    const hourUtc = new Date(pickedTs).getUTCHours();

    if (hourUtc <= 14) return "Before Open";
    if (hourUtc >= 20) return "After Close";
    return "Time TBD";
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await yahooFinance.quote(tickers);
    const results: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];

    const quotes: StockQuote[] = results
      .filter((r) => r != null && typeof r.symbol === "string")
      .map((r: Record<string, unknown>) => ({
        ticker: r.symbol as string,
        price: (r.regularMarketPrice as number) ?? 0,
        current_volume: (r.regularMarketVolume as number) ?? 0,
        day_change: (r.regularMarketChange as number) ?? 0,
        day_change_percent: computeIntradayPercentFromQuoteRow(r),
        next_earnings_date: extractNextEarningsDate(r),
        earnings_timing: extractEarningsTiming(r),
        market_cap: (r.marketCap as number) ?? 0,
        shares_outstanding: (r.sharesOutstanding as number) ?? 0,
        pe_ratio: (r.trailingPE as number) ?? 0,
        dividend_yield: ((r.dividendYield as number) ?? 0) / 100,
        fifty_two_week_high: (r.fiftyTwoWeekHigh as number) ?? 0,
        fifty_two_week_low: (r.fiftyTwoWeekLow as number) ?? 0,
        avg_volume: (r.averageDailyVolume3Month as number) ?? (r.averageDailyVolume10Day as number) ?? 0,
        beta: (r.beta as number) ?? 0,
      }));

    return quotes;
  } catch (error) {
    console.error(`[Yahoo] Batch quote failed for ${tickers.length} tickers:`, error);
    return [];
  }
}

/**
 * Fetch main US market indices in real time for header mini-cards.
 */
export async function getMarketIndices(): Promise<MarketIndexQuote[]> {
  const cacheKey = "market-indices";
  const mapped = await resolveWithSWR<MarketIndexQuote[]>({
    ticker: cacheKey,
    cacheKey: "indices",
    ttlMs: TTL.INDICES,
    staleWhileRevalidateMs: SWR.INDICES,
    fetchFresh: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = await yahooFinance.quote(
        MARKET_INDICES.map((item) => item.symbol)
      );
      const rows: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];

      return MARKET_INDICES.map((idx) => {
        const match = rows.find((row) => row.symbol === idx.symbol) ?? {};
        const rawPct = (match.regularMarketChangePercent as number) ?? 0;
        const marketPrice = (match.regularMarketPrice as number) ?? 0;
        const dayChange = (match.regularMarketChange as number) ?? 0;
        const previousClose =
          (match.regularMarketPreviousClose as number) ??
          (marketPrice !== 0 ? marketPrice - dayChange : 0);

        let changePercent = 0;

        if (previousClose > 0 && Number.isFinite(dayChange)) {
          // Most reliable: derive true intraday % from change / previous close
          changePercent = dayChange / previousClose;
        } else if (Number.isFinite(rawPct)) {
          // Yahoo can return either 1.23 (percent points) or 0.0123 (ratio)
          changePercent = Math.abs(rawPct) > 1 ? rawPct / 100 : rawPct;
        }

        return {
          symbol: idx.symbol,
          label: idx.label,
          price: marketPrice,
          change_percent: changePercent,
        } satisfies MarketIndexQuote;
      });
    },
    isUsable: (value): value is MarketIndexQuote[] =>
      Array.isArray(value) && value.length === MARKET_INDICES.length,
    onRefreshError: (error) => {
      console.error("[Yahoo] Failed to fetch market indices:", error);
    },
  });

  if (mapped && mapped.length > 0) {
    return mapped;
  }

  return MARKET_INDICES.map((item) => ({
    symbol: item.symbol,
    label: item.label,
    price: 0,
    change_percent: 0,
  }));
}

/**
 * Batch-fetch basic profiles for multiple tickers.
 * Uses the quote endpoint which includes name and exchange info.
 *
 * @param tickers - Array of stock symbols
 * @returns Array of partial StockProfile objects
 */
export async function getBatchProfiles(
  tickers: string[]
): Promise<StockProfile[]> {
  if (tickers.length === 0) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await yahooFinance.quote(tickers);
    const results: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];

    const profiles: StockProfile[] = results
      .filter((r) => r != null && typeof r.symbol === "string")
      .map((r: Record<string, unknown>) => ({
        ticker: r.symbol as string,
        name: (r.longName as string) ?? (r.shortName as string) ?? (r.symbol as string),
        sector: "",
        industry: "",
        exchange: (r.fullExchangeName as string) ?? (r.exchange as string) ?? "US",
        currency: (r.currency as string) ?? "USD",
        country: "US",
        description: "",
        logo_url: buildTickerLogoUrl((r.website as string) ?? null),
        website: "",
      }));

    return profiles;
  } catch (error) {
    console.error(`[Yahoo] Batch profiles failed:`, error);
    return [];
  }
}

function numFromUnknown(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === "object" && value !== null) {
    const asRecord = value as Record<string, unknown>;
    return numFromUnknown(asRecord.raw ?? asRecord.fmt ?? null);
  }

  return null;
}

function parseQuarterLabelFromDate(date: Date): string {
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${q} ${date.getUTCFullYear()}`;
}

function parseYahooHistoryRow(row: Record<string, unknown>): EarningsHistoryPoint | null {
  const quarterRaw = (row.quarter as Record<string, unknown> | undefined)?.raw ?? row.quarter;
  const quarterDate = new Date(String(quarterRaw ?? ""));
  const hasQuarterDate = !Number.isNaN(quarterDate.getTime());

  const rawEpsActual = numFromUnknown(row.epsActual);
  const epsEstimate = numFromUnknown(row.epsEstimate);
  const directSurprise = numFromUnknown(row.surprisePercent);
  const isFutureQuarter = hasQuarterDate && quarterDate.getTime() > Date.now();
  const epsActual =
    isFutureQuarter && rawEpsActual === 0 && epsEstimate != null
      ? null
      : rawEpsActual;
  const computedSurprise =
    epsActual != null && epsEstimate != null && Math.abs(epsEstimate) > 0
      ? ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100
      : null;

  if (epsActual == null && epsEstimate == null) return null;

  return {
    quarter: hasQuarterDate ? parseQuarterLabelFromDate(quarterDate) : "Unknown",
    report_date: hasQuarterDate ? quarterDate.toISOString().slice(0, 10) : null,
    eps_actual: epsActual,
    eps_estimate: epsEstimate,
    revenue_estimate: null,
    revenue_actual: null,
    surprise_percent: directSurprise ?? computedSurprise,
  };
}

function parseTrendQuarterRows(rawTrend: unknown): EarningsHistoryPoint[] {
  if (!Array.isArray(rawTrend)) return [];

  return rawTrend
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const period = String(row.period ?? "").toLowerCase();

      // Keep only quarterly periods (e.g. -1q, 0q, +1q).
      if (!period.includes("q")) return null;

      const endDateRaw = row.endDate;
      const endDate = new Date(String(endDateRaw ?? ""));
      if (Number.isNaN(endDate.getTime())) return null;

      const epsEstimate = numFromUnknown(
        (row.earningsEstimate as Record<string, unknown> | undefined)?.avg
      );
      const revenueEstimate = numFromUnknown(
        (row.revenueEstimate as Record<string, unknown> | undefined)?.avg
      );

      if (epsEstimate == null && revenueEstimate == null) return null;

      const point: EarningsHistoryPoint = {
        quarter: parseQuarterLabelFromDate(endDate),
        report_date: endDate.toISOString().slice(0, 10),
        eps_actual: null,
        eps_estimate: epsEstimate,
        revenue_estimate: revenueEstimate,
        revenue_actual: null,
        surprise_percent: null,
      };

      return point;
    })
    .filter((value): value is EarningsHistoryPoint => value !== null);
}

function parseEarningsChartQuarterRows(rawEarnings: unknown): EarningsHistoryPoint[] {
  if (!rawEarnings || typeof rawEarnings !== "object") return [];

  const quarterly = (
    (rawEarnings as Record<string, unknown>).earningsChart as Record<string, unknown> | undefined
  )?.quarterly;

  if (!Array.isArray(quarterly)) return [];

  return quarterly
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;

      const fiscalQuarter = row.fiscalQuarter;
      const normalizedQuarter =
        typeof fiscalQuarter === "string"
          ? fiscalQuarter.replace(/^([1-4])Q(\d{4})$/, "Q$1 $2")
          : null;

      const periodEndRaw = row.periodEndDate;
      const periodEndDate =
        typeof periodEndRaw === "number"
          ? new Date(periodEndRaw < 1e12 ? periodEndRaw * 1000 : periodEndRaw)
          : null;

      const quarter =
        normalizedQuarter ??
        (periodEndDate && !Number.isNaN(periodEndDate.getTime())
          ? parseQuarterLabelFromDate(periodEndDate)
          : null);

      if (!quarter) return null;

      const epsActual = numFromUnknown(row.actual);
      const epsEstimate = numFromUnknown(row.estimate);
      const surprise = numFromUnknown(row.surprisePct);

      const reportDateRaw = row.reportedDate;
      const reportDate =
        typeof reportDateRaw === "number"
          ? new Date(reportDateRaw < 1e12 ? reportDateRaw * 1000 : reportDateRaw)
          : null;

      const reportDateIso =
        reportDate && !Number.isNaN(reportDate.getTime())
          ? reportDate.toISOString().slice(0, 10)
          : periodEndDate && !Number.isNaN(periodEndDate.getTime())
            ? periodEndDate.toISOString().slice(0, 10)
            : null;

      const point: EarningsHistoryPoint = {
        quarter,
        report_date: reportDateIso,
        eps_actual: epsActual,
        eps_estimate: epsEstimate,
        revenue_estimate: null,
        revenue_actual: null,
        surprise_percent: surprise,
      };

      return point;
    })
    .filter((value): value is EarningsHistoryPoint => value !== null);
}

function parseFinancialsChartQuarterRows(rawEarnings: unknown): EarningsHistoryPoint[] {
  if (!rawEarnings || typeof rawEarnings !== "object") return [];

  const quarterly = (
    (rawEarnings as Record<string, unknown>).financialsChart as Record<string, unknown> | undefined
  )?.quarterly;

  if (!Array.isArray(quarterly)) return [];

  return quarterly
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;

      const fiscalQuarter = row.fiscalQuarter;
      const normalizedQuarter =
        typeof fiscalQuarter === "string"
          ? fiscalQuarter.replace(/^([1-4])Q(\d{4})$/, "Q$1 $2")
          : null;

      const periodEndRaw = row.periodEndDate;
      const periodEndDate =
        typeof periodEndRaw === "number"
          ? new Date(periodEndRaw < 1e12 ? periodEndRaw * 1000 : periodEndRaw)
          : null;

      const quarter =
        normalizedQuarter ??
        (periodEndDate && !Number.isNaN(periodEndDate.getTime())
          ? parseQuarterLabelFromDate(periodEndDate)
          : null);

      if (!quarter) return null;

      const revenue = numFromUnknown(row.revenue);
      if (revenue == null) return null;

      const reportDate =
        periodEndDate && !Number.isNaN(periodEndDate.getTime())
          ? periodEndDate.toISOString().slice(0, 10)
          : null;

      const point: EarningsHistoryPoint = {
        quarter,
        report_date: reportDate,
        eps_actual: null,
        eps_estimate: null,
        revenue_estimate: null,
        revenue_actual: revenue,
        surprise_percent: null,
      };

      return point;
    })
    .filter((value): value is EarningsHistoryPoint => value !== null);
}

function mergeEarningsHistoryRows(
  ...groups: EarningsHistoryPoint[][]
): EarningsHistoryPoint[] {
  const byQuarter = new Map<string, EarningsHistoryPoint>();

  for (const group of groups) {
    for (const row of group) {
      const existing = byQuarter.get(row.quarter);
      if (!existing) {
        byQuarter.set(row.quarter, { ...row });
        continue;
      }

      byQuarter.set(row.quarter, {
        quarter: row.quarter,
        report_date: existing.report_date ?? row.report_date,
        eps_actual: existing.eps_actual ?? row.eps_actual,
        eps_estimate: existing.eps_estimate ?? row.eps_estimate,
        revenue_estimate: existing.revenue_estimate ?? row.revenue_estimate ?? null,
        revenue_actual: existing.revenue_actual ?? row.revenue_actual ?? null,
        surprise_percent: existing.surprise_percent ?? row.surprise_percent,
      });
    }
  }

  return Array.from(byQuarter.values())
    .sort((a, b) => {
      const da = a.report_date ? new Date(`${a.report_date}T00:00:00Z`).getTime() : 0;
      const db = b.report_date ? new Date(`${b.report_date}T00:00:00Z`).getTime() : 0;
      return db - da;
    })
    .slice(0, 20);
}

function parseNextEarningsDate(data: YahooQuoteSummaryResult): string | null {
  const asAny = data as unknown as Record<string, unknown>;
  const events = (asAny.calendarEvents as Record<string, unknown> | undefined)?.earnings;
  const earnings = events as Record<string, unknown> | undefined;
  const earningsDate = (earnings?.earningsDate ?? []) as unknown;

  const parsed = Array.isArray(earningsDate)
    ? earningsDate
        .map((entry) => {
          if (entry == null) return null;
          if (entry instanceof Date) return Number.isNaN(entry.getTime()) ? null : entry.toISOString().slice(0, 10);
          if (typeof entry === "number") {
            const ms = entry < 1e12 ? entry * 1000 : entry;
            const date = new Date(ms);
            return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
          }
          if (typeof entry === "string") {
            const date = new Date(entry);
            return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
          }
          if (typeof entry === "object") {
            const value = (entry as Record<string, unknown>).raw ?? (entry as Record<string, unknown>).fmt;
            return typeof value === "string" ? value.slice(0, 10) : null;
          }
          return null;
        })
        .filter((value): value is string => value != null)
        .sort()
    : [];

  const now = Date.now();
  const future = parsed.find((value) => new Date(`${value}T00:00:00Z`).getTime() >= now);
  return future ?? parsed[parsed.length - 1] ?? null;
}

function parseEarningsTimingFromSummary(data: YahooQuoteSummaryResult): "Before Open" | "After Close" | "Time TBD" {
  const nextDate = parseNextEarningsDate(data);
  if (!nextDate) return "Time TBD";
  return "Time TBD";
}

function hasSufficientEpsHistory(insight: EarningsInsight): boolean {
  const history = insight.history ?? [];
  if (history.length < 10) return false;

  const reportedCount = history.filter((row) => row.eps_actual != null).length;
  const estimateCount = history.filter((row) => row.eps_estimate != null).length;

  // Require enough depth to avoid the "only ~5 quarters" degraded cache state.
  return reportedCount >= 10 && estimateCount >= 6;
}

async function getEarningsInsight(ticker: string): Promise<EarningsInsight> {
  const key = ticker.toUpperCase();
  const cacheNamespace = "earnings-insight-v2";
  const cached = await getCachedData<EarningsInsight>(key, cacheNamespace, TTL.EARNINGS_INSIGHT);
  if (cached && hasSufficientEpsHistory(cached)) return cached;

  const empty: EarningsInsight = {
    ticker: key,
    company_name: null,
    next_earnings_date: null,
    earnings_timing: "Time TBD",
    est_eps: null,
    est_revenue: null,
    history: [],
    investor_relations_url: null,
    webcast_url: null,
    source: "none",
  };

  try {
    let raw: YahooQuoteSummaryResult;

    try {
      raw = await fetchFromYahoo(key, EARNINGS_INSIGHT_MODULES);
    } catch (err: unknown) {
      const isInternalError = err instanceof Error && err.message === "internal-error";
      if (!isInternalError) throw err;

      // Retry with a reduced module set that still includes core earnings payload.
      try {
        raw = await fetchFromYahoo(key, ["price", "summaryProfile", "calendarEvents", "earnings"]);
      } catch {
        raw = await fetchFromYahoo(key, ["price", "summaryProfile", "calendarEvents"]);
      }
    }

    const asAny = raw as unknown as Record<string, unknown>;
    const website = raw.summaryProfile?.website ?? null;
    const cleanWebsite =
      typeof website === "string" && website.length > 0
        ? website.startsWith("http")
          ? website
          : `https://${website}`
        : null;

    const trendRows = ((asAny.earningsTrend as Record<string, unknown> | undefined)?.trend ?? []) as unknown[];
    const trendCurrent = Array.isArray(trendRows)
      ? (trendRows.find((entry) => {
          const period = (entry as Record<string, unknown>).period;
          return typeof period === "string" && (period.toLowerCase().includes("0q") || period.toLowerCase().includes("current"));
        }) as Record<string, unknown> | undefined)
      : undefined;

    const estEpsFromTrend = trendCurrent
      ? numFromUnknown((trendCurrent.earningsEstimate as Record<string, unknown> | undefined)?.avg)
      : null;
    const estRevenueFromTrend = trendCurrent
      ? numFromUnknown((trendCurrent.revenueEstimate as Record<string, unknown> | undefined)?.avg)
      : null;

    const calendarEarnings = (asAny.calendarEvents as Record<string, unknown> | undefined)?.earnings as
      | Record<string, unknown>
      | undefined;
    const estEpsFromCalendar = numFromUnknown(calendarEarnings?.earningsAverage);
    const estRevenueFromCalendar = numFromUnknown(calendarEarnings?.revenueAverage);

    const earningsChart =
      (asAny.earnings as Record<string, unknown> | undefined)?.earningsChart as
        | Record<string, unknown>
        | undefined;
    const estEpsFromEarningsChart = numFromUnknown(earningsChart?.currentQuarterEstimate);

    const yahooHistory =
      ((asAny.earningsHistory as Record<string, unknown> | undefined)?.history ?? []) as Array<
        Record<string, unknown>
      >;
    const parsedYahooHistory = yahooHistory
      .map((row) => parseYahooHistoryRow(row))
      .filter((value): value is EarningsHistoryPoint => value !== null);
    const parsedEarningsChartRows = parseEarningsChartQuarterRows(asAny.earnings);
    const parsedTrendRows = parseTrendQuarterRows(trendRows);
    const parsedRevenueRows = parseFinancialsChartQuarterRows(asAny.earnings);

    const mergedHistory: EarningsHistoryPoint[] = mergeEarningsHistoryRows(
      parsedEarningsChartRows,
      parsedYahooHistory,
      parsedTrendRows,
      parsedRevenueRows
    );
    const mergedEstEps: number | null =
      estEpsFromEarningsChart ?? estEpsFromCalendar ?? estEpsFromTrend;
    const source: EarningsInsight["source"] =
      mergedHistory.length > 0 || mergedEstEps != null || estRevenueFromTrend != null
        ? "yahoo"
        : "none";

    const insight: EarningsInsight = {
      ticker: key,
      company_name: raw.price?.longName ?? raw.price?.shortName ?? key,
      next_earnings_date: parseNextEarningsDate(raw),
      earnings_timing: parseEarningsTimingFromSummary(raw),
      est_eps: mergedEstEps,
      est_revenue: estRevenueFromCalendar ?? estRevenueFromTrend,
      history: mergedHistory,
      investor_relations_url: cleanWebsite,
      webcast_url: cleanWebsite,
      source,
    };

    await setCachedData(key, cacheNamespace, insight as unknown as Record<string, unknown>);
    return insight;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Yahoo] Failed to fetch earnings insight for ${key}: ${message}`);

    return empty;
  }
}

export async function getBatchEarningsInsights(
  tickers: string[]
): Promise<Record<string, EarningsInsight>> {
  const normalized = Array.from(new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean)));
  if (normalized.length === 0) return {};

  const entries = await Promise.all(
    normalized.map(async (ticker) => {
      const insight = await getEarningsInsight(ticker);
      return [ticker, insight] as const;
    })
  );

  return Object.fromEntries(entries);
}

type PerformanceWindow = "1D" | "1W" | "1M" | "YTD" | "1Y" | "ALL";
type DailyHistoryWindow = "1W" | "1M" | "YTD" | "1Y" | "ALL";

function normalizePct(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.abs(raw) > 1 ? raw / 100 : raw;
}

function computeIntradayPercentFromQuoteRow(row: Record<string, unknown>): number {
  const marketPrice = (row.regularMarketPrice as number) ?? 0;
  const dayChange = (row.regularMarketChange as number) ?? 0;
  const previousClose =
    (row.regularMarketPreviousClose as number) ??
    (marketPrice !== 0 ? marketPrice - dayChange : 0);

  if (previousClose > 0 && Number.isFinite(dayChange)) {
    return dayChange / previousClose;
  }

  return normalizePct((row.regularMarketChangePercent as number) ?? 0);
}

function getWindowStartDate(window: PerformanceWindow): string {
  const now = new Date();

  if (window === "YTD") {
    return `${now.getFullYear()}-01-01`;
  }

  if (window === "1Y") {
    const start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    return start.toISOString().slice(0, 10);
  }

  if (window === "ALL") {
    const start = new Date(now);
    start.setFullYear(start.getFullYear() - 10);
    return start.toISOString().slice(0, 10);
  }

  const days = window === "1W" ? 8 : 35;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return start.toISOString().slice(0, 10);
}

async function getTickerWindowPerformance(
  ticker: string,
  window: PerformanceWindow
): Promise<number> {
  const key = ticker.toUpperCase();
  const cacheKey = `${key}-${window}`;

  const cached = await getCachedData<{ pct: number }>(
    cacheKey,
    "performance",
    TTL.PERFORMANCE
  );
  if (cached && typeof cached.pct === "number") {
    return cached.pct;
  }

  let pct = 0;

  try {
    if (window === "1D") {
      const raw: unknown = await yahooFinance.quote(key);
      const row = (raw ?? {}) as Record<string, unknown>;
      pct = computeIntradayPercentFromQuoteRow(row);
    } else {
      const rows = await withSuppressedYahooWarnings(async () =>
        yahooHistoricalClient.historical(key, {
          period1: getWindowStartDate(window),
          period2: new Date().toISOString().slice(0, 10),
          interval: "1d",
        })
      );

      const closes: number[] = Array.isArray(rows)
        ? rows
            .map((row) => (row?.close as number) ?? 0)
            .filter((value) => Number.isFinite(value) && value > 0)
        : [];

      if (closes.length >= 2) {
        const start = closes[0];
        const end = closes[closes.length - 1];
        pct = start > 0 ? (end - start) / start : 0;
      }
    }
  } catch (error) {
    console.error(`[Yahoo] Performance failed for ${key} (${window}):`, error);
    pct = 0;
  }

  await setCachedData(
    cacheKey,
    "performance",
    { pct } as unknown as Record<string, unknown>
  );

  return pct;
}

export async function getBatchPeriodPerformance(
  tickers: string[],
  window: PerformanceWindow
): Promise<Record<string, number>> {
  const symbols = Array.from(
    new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))
  );

  if (symbols.length === 0) return {};

  if (window === "1D") {
    try {
      const raw: unknown = await yahooFinance.quote(symbols);
      const rows: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];

      return Object.fromEntries(
        symbols.map((symbol) => {
          const row = rows.find((item) => item?.symbol === symbol) ?? {};
          const pct = computeIntradayPercentFromQuoteRow(row);
          return [symbol, pct];
        })
      );
    } catch (error) {
      console.error(`[Yahoo] Batch 1D performance failed:`, error);
      return Object.fromEntries(symbols.map((symbol) => [symbol, 0]));
    }
  }

  const CHUNK_SIZE = 8;
  const result: Record<string, number> = {};

  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + CHUNK_SIZE);
    const values = await Promise.all(
      chunk.map(async (symbol) => [symbol, await getTickerWindowPerformance(symbol, window)] as const)
    );

    for (const [symbol, pct] of values) {
      result[symbol] = pct;
    }
  }

  return result;
}

async function getTickerDailyHistory(
  ticker: string,
  window: DailyHistoryWindow
): Promise<Array<{ date: string; close: number }>> {
  const key = ticker.toUpperCase();
  const cacheKey = `${key}-${window}`;

  const cached = await getCachedData<{ points: Array<{ date: string; close: number }> }>(
    cacheKey,
    "daily-history",
    TTL.PERFORMANCE
  );
  if (cached && Array.isArray(cached.points) && cached.points.length > 1) {
    return cached.points;
  }

  try {
    const rowsUnknown = await withSuppressedYahooWarnings(async () =>
      yahooHistoricalClient.historical(key, {
        period1: getWindowStartDate(window),
        period2: new Date().toISOString().slice(0, 10),
        interval: "1d",
      })
    );
    const rows: Array<Record<string, unknown>> = Array.isArray(rowsUnknown)
      ? (rowsUnknown as Array<Record<string, unknown>>)
      : [];

    const points = rows
      .map((row) => {
        const rawDate = row?.date;
        const parsedDate =
          rawDate instanceof Date
            ? rawDate
            : typeof rawDate === "string" || typeof rawDate === "number"
              ? new Date(rawDate)
              : null;
        if (!parsedDate) return { date: "", close: 0 };
        const date = Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString().slice(0, 10);
        const close = (row?.close as number) ?? 0;
        return { date, close };
      })
      .filter((row) => Number.isFinite(row.close) && row.close > 0 && row.date.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (points.length > 1) {
      await setCachedData(
        cacheKey,
        "daily-history",
        { points } as unknown as Record<string, unknown>
      );
    }

    return points;
  } catch (error) {
    console.error(`[Yahoo] Daily history failed for ${key} (${window}):`, error);
    return [];
  }
}

export async function getBatchDailyHistory(
  tickers: string[],
  window: DailyHistoryWindow
): Promise<Record<string, Array<{ date: string; close: number }>>> {
  const symbols = Array.from(
    new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))
  );

  if (symbols.length === 0) return {};

  const CHUNK_SIZE = 6;
  const result: Record<string, Array<{ date: string; close: number }>> = {};

  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + CHUNK_SIZE);
    const values = await Promise.all(
      chunk.map(async (symbol) => [symbol, await getTickerDailyHistory(symbol, window)] as const)
    );

    for (const [symbol, points] of values) {
      result[symbol] = points;
    }
  }

  return result;
}

async function getTickerIntradayTrend(ticker: string): Promise<number[]> {
  const key = ticker.toUpperCase();
  const cacheKey = `${key}-intraday-trend`;

  const cached = await getCachedData<{ points: number[] }>(
    cacheKey,
    "trend",
    TTL.INTRADAY_TREND
  );
  if (cached && Array.isArray(cached.points) && cached.points.length > 1) {
    return cached.points;
  }

  try {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const rows = await withSuppressedYahooWarnings(async () =>
      yahooHistoricalClient.historical(key, {
        period1: start.toISOString().slice(0, 10),
        period2: now.toISOString().slice(0, 10),
        interval: "5m",
      })
    );

    const points: number[] = Array.isArray(rows)
      ? rows
          .map((row) => (row?.close as number) ?? 0)
          .filter((value) => Number.isFinite(value) && value > 0)
      : [];

    if (points.length > 1) {
      await setCachedData(
        cacheKey,
        "trend",
        { points } as unknown as Record<string, unknown>
      );
      return points;
    }
  } catch (error) {
    console.error(`[Yahoo] Intraday trend failed for ${key}:`, error);
  }

  return [];
}

export async function getBatchIntradayTrend(
  tickers: string[]
): Promise<Record<string, number[]>> {
  const symbols = Array.from(
    new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))
  );

  if (symbols.length === 0) return {};

  const CHUNK_SIZE = 8;
  const result: Record<string, number[]> = {};

  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + CHUNK_SIZE);
    const values = await Promise.all(
      chunk.map(async (symbol) => [symbol, await getTickerIntradayTrend(symbol)] as const)
    );

    for (const [symbol, points] of values) {
      result[symbol] = points;
    }
  }

  return result;
}

async function getTickerBuybackStrength(ticker: string): Promise<number> {
  const key = ticker.toUpperCase();
  const cacheKey = `${key}-buyback-strength`;

  const cached = await getCachedData<{ pct: number }>(
    cacheKey,
    "buyback",
    TTL.BUYBACK
  );
  if (cached && typeof cached.pct === "number") {
    return cached.pct;
  }

  let pct = 0;

  try {
    const now = new Date();
    const period2 = `${now.getFullYear() + 1}-12-31`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = await (yahooFinance as any).fundamentalsTimeSeries(
      key,
      {
        period1: "2018-01-01",
        period2,
        type: "annual",
        module: "financials",
      },
      { validateResult: false }
    );

    const normalized = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        date: new Date((row?.date as string) ?? 0).getTime(),
        shares: (row?.dilutedAverageShares as number) ?? 0,
      }))
      .filter((row) => Number.isFinite(row.date) && row.shares > 0)
      .sort((a, b) => a.date - b.date);

    if (normalized.length >= 2) {
      const previous = normalized[normalized.length - 2].shares;
      const current = normalized[normalized.length - 1].shares;

      if (previous > 0) {
        pct = (previous - current) / previous;
      }
    }
  } catch (error) {
    console.error(`[Yahoo] Buyback strength failed for ${key}:`, error);
    pct = 0;
  }

  await setCachedData(
    cacheKey,
    "buyback",
    { pct } as unknown as Record<string, unknown>
  );

  return pct;
}

export async function getBatchBuybackStrength(
  tickers: string[]
): Promise<Record<string, number>> {
  const symbols = Array.from(
    new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))
  );
  if (symbols.length === 0) return {};

  const CHUNK_SIZE = 6;
  const result: Record<string, number> = {};

  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + CHUNK_SIZE);
    const values = await Promise.all(
      chunk.map(async (symbol) => [symbol, await getTickerBuybackStrength(symbol)] as const)
    );

    for (const [symbol, pct] of values) {
      result[symbol] = pct;
    }
  }

  return result;
}
