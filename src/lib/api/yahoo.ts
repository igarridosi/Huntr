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
import type { YahooQuoteSummaryResult, TimeSeriesFinancialsCache, FundamentalsTimeSeriesRow } from "@/types/yahoo";
import type { StockProfile, StockQuote, MarketIndexQuote } from "@/types/stock";
import type { CompanyFinancials } from "@/types/financials";
import { buildTickerLogoUrl } from "@/lib/logo";
import {
  mapToStockProfile,
  mapToStockQuote,
  mapTimeSeriesFinancials,
} from "./mappers";
import { getCachedData, setCachedData } from "./cache";

// ─────────────────────────────────────────────────────────
// yahoo-finance2 v3 requires instantiation
// ─────────────────────────────────────────────────────────

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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
] as const;

/** Combined profile + quote modules (for getFullStockData) */
const PROFILE_QUOTE_MODULES = [
  ...new Set([...PROFILE_MODULES, ...QUOTE_MODULES]),
] as const;

// ─────────────────────────────────────────────────────────
// Cache TTLs (in ms)
// ─────────────────────────────────────────────────────────

const TTL = {
  PROFILE: 7 * 24 * 60 * 60 * 1000,   // 7 days — rarely changes
  QUOTE: 5 * 60 * 1000,                // 5 minutes — price data
  INDICES: 10 * 1000,                  // 10 seconds — market indices (near real-time)
  PERFORMANCE: 30 * 60 * 1000,         // 30 minutes — period performance
  BUYBACK: 24 * 60 * 60 * 1000,        // 24 hours — capital allocation changes slowly
  FINANCIALS: 24 * 60 * 60 * 1000,     // 24 hours — earnings cycle
} as const;

const MARKET_INDICES = [
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
] as const;

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
// Internal: fundamentalsTimeSeries fetcher
// ─────────────────────────────────────────────────────────

/**
 * Fetch a single fundamentalsTimeSeries module for a given period type.
 * Uses `validateResult: false` because yahoo-finance2 schema validation
 * fails on many fields returned by this endpoint.
 */
async function fetchTimeSeriesModule(
  ticker: string,
  module: string,
  periodType: "annual" | "quarterly"
): Promise<FundamentalsTimeSeriesRow[]> {
  try {
    const now = new Date();
    const period2 = `${now.getFullYear() + 1}-12-31`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (yahooFinance as any).fundamentalsTimeSeries(
      ticker,
      {
        period1: "2005-01-01",
        period2,
        type: periodType,
        module,
      },
      { validateResult: false }
    );

    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error(
      `[Yahoo] fundamentalsTimeSeries(${ticker}, ${module}, ${periodType}) failed:`,
      error
    );
    return [];
  }
}

/**
 * Fetch all 6 financial time-series calls in parallel:
 *   3 modules (financials, balance-sheet, cash-flow) × 2 period types (annual, quarterly)
 */
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

  // 1. Check cache
  const cached = await getCachedData<YahooQuoteSummaryResult>(
    key,
    "profile",
    TTL.PROFILE
  );
  if (cached) {
    return mapToStockProfile(key, cached);
  }

  // 2. Fetch from Yahoo
  try {
    const raw = await fetchFromYahoo(key, PROFILE_MODULES);
    // 3. Cache the raw Yahoo response
    await setCachedData(
      key,
      "profile",
      raw as unknown as Record<string, unknown>
    );
    // 4. Map and return
    return mapToStockProfile(key, raw);
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch profile for ${key}:`, error);
    return null;
  }
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

  // 1. Check cache
  const cached = await getCachedData<YahooQuoteSummaryResult>(
    key,
    "quote",
    TTL.QUOTE
  );
  if (cached) {
    return mapToStockQuote(key, cached);
  }

  // 2. Fetch from Yahoo
  try {
    const raw = await fetchFromYahoo(key, QUOTE_MODULES);
    await setCachedData(
      key,
      "quote",
      raw as unknown as Record<string, unknown>
    );
    return mapToStockQuote(key, raw);
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch quote for ${key}:`, error);
    return null;
  }
}

/**
 * Get full financial statements (Income, Balance, CashFlow) for a ticker.
 * Uses fundamentalsTimeSeries (replaces deprecated quoteSummary financial modules).
 * Fetches up to 20 years of annual + quarterly data in parallel.
 *
 * @param ticker - Stock symbol
 * @returns CompanyFinancials or null if not found
 */
export async function getFinancials(
  ticker: string
): Promise<CompanyFinancials | null> {
  const key = ticker.toUpperCase();

  // 1. Check cache (v2 key to avoid stale quoteSummary format)
  const cached = await getCachedData<TimeSeriesFinancialsCache>(
    key,
    "financials-v2",
    TTL.FINANCIALS
  );
  if (cached) {
    return mapTimeSeriesFinancials(key, cached);
  }

  // 2. Fetch from Yahoo via fundamentalsTimeSeries (6 parallel calls)
  try {
    const raw = await fetchAllFinancialTimeSeries(key);
    await setCachedData(
      key,
      "financials-v2",
      raw as unknown as Record<string, unknown>
    );
    return mapTimeSeriesFinancials(key, raw);
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch financials for ${key}:`, error);
    return null;
  }
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

  try {
    // Fetch profile+quote (quoteSummary) and financials (timeSeries) in parallel
    const [profileQuoteRaw, financials] = await Promise.all([
      fetchFromYahoo(key, PROFILE_QUOTE_MODULES),
      getFinancials(key),
    ]);

    // Cache profile and quote segments
    const rawRecord = profileQuoteRaw as unknown as Record<string, unknown>;
    await Promise.all([
      setCachedData(key, "profile", rawRecord),
      setCachedData(key, "quote", rawRecord),
    ]);

    return {
      profile: mapToStockProfile(key, profileQuoteRaw),
      quote: mapToStockQuote(key, profileQuoteRaw),
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
        day_change_percent: (((r.regularMarketChangePercent as number) ?? 0) / 100),
        next_earnings_date: null,
        market_cap: (r.marketCap as number) ?? 0,
        shares_outstanding: (r.sharesOutstanding as number) ?? 0,
        pe_ratio: (r.trailingPE as number) ?? 0,
        dividend_yield: ((r.dividendYield as number) ?? 0) / 100,
        fifty_two_week_high: (r.fiftyTwoWeekHigh as number) ?? 0,
        fifty_two_week_low: (r.fiftyTwoWeekLow as number) ?? 0,
        avg_volume: (r.averageDailyVolume3Month as number) ?? (r.averageDailyVolume10Day as number) ?? 0,
        beta: 0,
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
  const cached = await getCachedData<MarketIndexQuote[]>(
    cacheKey,
    "indices",
    TTL.INDICES
  );
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await yahooFinance.quote(
      MARKET_INDICES.map((item) => item.symbol)
    );
    const rows: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];

    const mapped: MarketIndexQuote[] = MARKET_INDICES.map((idx) => {
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
      };
    });

    await setCachedData(
      cacheKey,
      "indices",
      mapped as unknown as Record<string, unknown>
    );

    return mapped;
  } catch (error) {
    console.error("[Yahoo] Failed to fetch market indices:", error);
    return MARKET_INDICES.map((item) => ({
      symbol: item.symbol,
      label: item.label,
      price: 0,
      change_percent: 0,
    }));
  }
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

type PerformanceWindow = "1D" | "1W" | "1M" | "YTD";

function normalizePct(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.abs(raw) > 1 ? raw / 100 : raw;
}

function getWindowStartDate(window: PerformanceWindow): string {
  const now = new Date();

  if (window === "YTD") {
    return `${now.getFullYear()}-01-01`;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = await yahooFinance.quote(key);
      pct = normalizePct((raw?.regularMarketChangePercent as number) ?? 0);
    } else {
      const rows = await (yahooFinance as any).historical(key, {
        period1: getWindowStartDate(window),
        period2: new Date().toISOString().slice(0, 10),
        interval: "1d",
      });

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = await yahooFinance.quote(symbols);
      const rows: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];

      return Object.fromEntries(
        symbols.map((symbol) => {
          const row = rows.find((item) => item?.symbol === symbol) ?? {};
          const pct = normalizePct((row.regularMarketChangePercent as number) ?? 0);
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
