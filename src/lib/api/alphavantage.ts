import type {
  BalanceSheet,
  CashFlowStatement,
  CompanyFinancials,
  IncomeStatement,
} from "@/types/financials";
import type { EarningsInsight, StockProfile, StockQuote } from "@/types/stock";
import { buildTickerLogoUrl, normalizeWebsiteUrl } from "@/lib/logo";
import { getCachedDataState, setCachedData, withSingleFlight } from "./cache";
import { createHash } from "crypto";

type AlphaFunction =
  | "GLOBAL_QUOTE"
  | "OVERVIEW"
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "CASH_FLOW"
  | "EARNINGS"
  | "EARNINGS_CALL_TRANSCRIPT";
const ALPHA_MIN_INTERVAL_MS = 13_000;
const ALPHA_THROTTLE_RETRY_MS = 2_000;
const ALPHA_MAX_RETRIES = 2;
const ALPHA_THROTTLE_COOLDOWN_MS = 65_000;
const ALPHA_THROTTLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ALPHA_THROTTLE_CACHE_KEY = "alpha-throttle-v2";
const ALPHA_REQUEST_TIMEOUT_MS = 8_000;

let alphaQueue: Promise<void> = Promise.resolve();
let alphaNextAllowedAt = 0;
// Per-API-key throttle map (keyed by hashed key) — prevents one key blocking another.
const alphaThrottleUntilByKey = new Map<string, number>();

interface AlphaThrottleState {
  reason: string;
  until: string;
}

// ── Throttle helpers keyed by API key hash ───────────────────────────────────

function getAlphaThrottleCacheTicker(apiKey: string | undefined): string {
  const normalized = apiKey?.trim();
  if (!normalized) return "GLOBAL:NO_KEY";
  const keyHash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `GLOBAL:${keyHash}`;
}

function getAlphaThrottleUntil(apiKey: string): number {
  return alphaThrottleUntilByKey.get(getAlphaThrottleCacheTicker(apiKey)) ?? 0;
}

function setAlphaThrottleUntil(apiKey: string, untilMs: number): void {
  alphaThrottleUntilByKey.set(getAlphaThrottleCacheTicker(apiKey), untilMs);
}

export class AlphaThrottleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlphaThrottleError";
  }
}

export class AlphaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlphaApiError";
  }
}

export async function readAlphaThrottleState(apiKey?: string): Promise<AlphaThrottleState | null> {
  const lookup = await getCachedDataState<AlphaThrottleState>(
    getAlphaThrottleCacheTicker(apiKey),
    ALPHA_THROTTLE_CACHE_KEY,
    ALPHA_THROTTLE_CACHE_TTL_MS
  );

  const untilMs = lookup.data?.until ? new Date(lookup.data.until).getTime() : NaN;
  if (!Number.isFinite(untilMs) || untilMs <= Date.now()) {
    return null;
  }

  return lookup.data;
}

async function recordAlphaThrottleState(reason: string, apiKey: string): Promise<void> {
  const untilMs = Date.now() + ALPHA_THROTTLE_COOLDOWN_MS;
  const until = new Date(untilMs).toISOString();
  setAlphaThrottleUntil(apiKey, untilMs);
  await setCachedData(getAlphaThrottleCacheTicker(apiKey), ALPHA_THROTTLE_CACHE_KEY, {
    reason,
    until,
  } satisfies AlphaThrottleState);
}

export function isAlphaThrottleError(error: unknown): boolean {
  if (error instanceof AlphaThrottleError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /AlphaVantage rate limited|cooling down/i.test(message);
}

function isAlphaRateLimitMessage(message: string): boolean {
  return /standard API rate limit|rate limit|frequency|calls per minute|calls per day/i.test(message);
}

function getAlphaPayloadMessage(
  payload: AlphaFinancialResponse | AlphaEarningsResponse | AlphaTranscriptResponse
): { message: string; throttled: boolean } | null {
  const errorMessage = (payload as Record<string, unknown>)["Error Message"] as string | undefined
    ?? payload.ErrorMessage;
  if (errorMessage) return { message: errorMessage, throttled: false };

  if (payload.Note) return { message: payload.Note, throttled: isAlphaRateLimitMessage(payload.Note) };

  if (payload.Information) {
    return {
      message: payload.Information,
      throttled: isAlphaRateLimitMessage(payload.Information),
    };
  }

  return null;
}

interface AlphaFinancialReport {
  fiscalDateEnding?: string;
  [key: string]: string | undefined;
}

interface AlphaFinancialResponse {
  symbol?: string;
  annualReports?: AlphaFinancialReport[];
  quarterlyReports?: AlphaFinancialReport[];
  Note?: string;
  Information?: string;
  ErrorMessage?: string;
}

interface AlphaEarningsPoint {
  fiscalDateEnding?: string;
  reportedEPS?: string;
  reportedDate?: string;
  estimatedEPS?: string;
  surprisePercentage?: string;
}

interface AlphaEarningsResponse {
  symbol?: string;
  annualEarnings?: AlphaEarningsPoint[];
  quarterlyEarnings?: AlphaEarningsPoint[];
  Note?: string;
  Information?: string;
  ErrorMessage?: string;
}

interface AlphaTranscriptResponse {
  symbol?: string;
  quarter?: string;
  year?: string;
  date?: string;
  content?: string;
  transcript?: string;
  Note?: string;
  Information?: string;
  ErrorMessage?: string;
}

interface AlphaOverviewResponse {
  Symbol?: string;
  Name?: string;
  AssetType?: string;
  Description?: string;
  Exchange?: string;
  Currency?: string;
  Country?: string;
  Sector?: string;
  Industry?: string;
  Website?: string;
  OfficialSite?: string;
  MarketCapitalization?: string;
  EBITDA?: string;
  PERatio?: string;
  DividendPerShare?: string;
  DividendYield?: string;
  EPS?: string;
  QuarterlyRevenueGrowthYOY?: string;
  QuarterlyEarningsGrowthYOY?: string;
  TrailingPE?: string;
  ForwardPE?: string;
  RevenueTTM?: string;
  ProfitMargin?: string;
  OperatingMarginTTM?: string;
  Beta?: string;
  "52WeekHigh"?: string;
  "52WeekLow"?: string;
  AverageVolume?: string;
  SharesOutstanding?: string;
  DividendDate?: string;
  ExDividendDate?: string;
  LatestQuarter?: string;
  Note?: string;
  Information?: string;
  ErrorMessage?: string;
  [key: string]: string | undefined;
}

interface AlphaGlobalQuoteResponse {
  "Global Quote"?: {
    "01. symbol"?: string;
    "02. open"?: string;
    "03. high"?: string;
    "04. low"?: string;
    "05. price"?: string;
    "06. volume"?: string;
    "07. latest trading day"?: string;
    "08. previous close"?: string;
    "09. change"?: string;
    "10. change percent"?: string;
  };
  Note?: string;
  Information?: string;
  ErrorMessage?: string;
}

export interface AlphaTranscriptDocument {
  ticker: string;
  year: number;
  quarter: number;
  published_at: string | null;
  content: string;
}

interface AlphaBundle {
  income: AlphaFinancialResponse;
  balance: AlphaFinancialResponse;
  cash: AlphaFinancialResponse;
  earnings: AlphaEarningsResponse;
}

export interface AlphaEarningsInsight {
  history: Array<{
    quarter: string;
    report_date: string | null;
    eps_actual: number | null;
    eps_estimate: number | null;
    surprise_percent: number | null;
  }>;
  est_eps: number | null;
  next_earnings_date: string | null;
}

function parseNullableNumber(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.trim();
  if (!cleaned || cleaned.toLowerCase() === "none") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.trim();
  if (!cleaned || cleaned.toLowerCase() === "none") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Alpha Vantage reports the same figure under different keys from one
 * filer to the next and writes "None" for the rest — Adobe's buybacks,
 * say, sit in `paymentsForRepurchaseOfEquity` while
 * `paymentsForRepurchaseOfCommonStock` is "None". The first key that
 * parses to a non-zero number wins.
 */
function firstNumber(row: AlphaFinancialReport, ...keys: string[]): number {
  for (const key of keys) {
    const v = parseNumber(row[key]);
    if (v !== 0) return v;
  }
  return 0;
}

function getDate(value: string | undefined): Date {
  if (!value) return new Date(0);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function toPeriodLabel(date: Date, kind: "annual" | "quarterly"): string {
  const year = date.getUTCFullYear();
  if (kind === "annual") return `FY${year}`;
  const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
  return `Q${quarter} ${year}`;
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

async function fetchAlphaFunction(
  symbol: string,
  fn: AlphaFunction,
  apiKey: string,
  extraParams?: Record<string, string>
): Promise<AlphaFinancialResponse | AlphaEarningsResponse | AlphaTranscriptResponse> {
  const throttleState = await readAlphaThrottleState(apiKey);
  if (throttleState) {
    throw new AlphaThrottleError(
      `AlphaVantage cooling down until ${throttleState.until}`
    );
  }

  const serializedParams = extraParams
    ? Object.entries(extraParams)
        .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("")
    : "";

  const url =
    `https://www.alphavantage.co/query?function=${fn}` +
    `&symbol=${encodeURIComponent(symbol)}` +
    serializedParams +
    `&apikey=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ALPHA_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Huntr/1.0" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AlphaVantage ${fn} failed with status ${response.status}`);
    }

    const payload = (await response.json()) as
      | AlphaFinancialResponse
      | AlphaEarningsResponse
      | AlphaTranscriptResponse;
    const alphaMessage = getAlphaPayloadMessage(payload);
    if (alphaMessage?.throttled) {
      throw new AlphaThrottleError(`AlphaVantage rate limited on ${fn}: ${alphaMessage.message}`);
    }
    if (alphaMessage) {
      throw new AlphaApiError(`AlphaVantage ${fn}: ${alphaMessage.message}`);
    }
    return payload;
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") {
      throw new Error(`AlphaVantage ${fn} request timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface AlphaSWROptions<T> {
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

async function resolveAlphaWithSWR<T>(options: AlphaSWROptions<T>): Promise<T | null> {
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

function parseAlphaNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, "").replace(/%/g, "").trim();
  if (!cleaned || cleaned.toLowerCase() === "none") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAlphaPercent(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned || cleaned.toLowerCase() === "none") return 0;

  const parsed = Number(cleaned.replace(/%/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  if (cleaned.includes("%")) return parsed / 100;
  return parsed > 1 ? parsed / 100 : parsed;
}

function parseAlphaDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
}

function getAlphaOverviewWebsite(data: AlphaOverviewResponse): string | null {
  return data.OfficialSite ?? data.Website ?? null;
}

function mapAlphaOverviewToProfile(ticker: string, data: AlphaOverviewResponse): StockProfile {
  const website = getAlphaOverviewWebsite(data);

  return {
    ticker: ticker.toUpperCase(),
    name: data.Name ?? ticker.toUpperCase(),
    sector: data.Sector ?? "Unknown",
    industry: data.Industry ?? "Unknown",
    exchange: data.Exchange ?? "Unknown",
    currency: data.Currency ?? "USD",
    country: data.Country ?? "Unknown",
    description: data.Description ?? "",
    logo_url: buildTickerLogoUrl(website),
    website: normalizeWebsiteUrl(website),
  };
}

function mapAlphaToQuote(
  ticker: string,
  overview: AlphaOverviewResponse | null,
  globalQuote: AlphaGlobalQuoteResponse | null,
  nextEarningsDate: string | null = null
): StockQuote {
  const quoteRow = globalQuote?.["Global Quote"] ?? {};
  const price = parseAlphaNumber(quoteRow["05. price"]);
  const previousClose = parseAlphaNumber(quoteRow["08. previous close"]);
  const dayChange = parseAlphaNumber(quoteRow["09. change"]) || (price - previousClose);
  const dayChangePercent = parseAlphaPercent(quoteRow["10. change percent"]);

  const marketCap = parseAlphaNumber(overview?.MarketCapitalization);
  const sharesOutstanding = parseAlphaNumber(overview?.SharesOutstanding)
    || (price > 0 && marketCap > 0 ? marketCap / price : 0);

  return {
    ticker: ticker.toUpperCase(),
    price,
    current_volume: parseAlphaNumber(quoteRow["06. volume"]),
    dividend_rate: parseAlphaNumber(overview?.DividendPerShare),
    dividend_date: parseAlphaDate(overview?.DividendDate),
    ex_dividend_date: parseAlphaDate(overview?.ExDividendDate),
    payout_ratio: 0,
    five_year_avg_dividend_yield: 0,
    revenue_growth: parseAlphaPercent(overview?.QuarterlyRevenueGrowthYOY),
    earnings_growth: parseAlphaPercent(overview?.QuarterlyEarningsGrowthYOY),
    day_change: dayChange,
    day_change_percent: dayChangePercent,
    next_earnings_date: nextEarningsDate,
    earnings_timing: "Time TBD",
    market_cap: marketCap,
    shares_outstanding: sharesOutstanding,
    pe_ratio: parseAlphaNumber(overview?.PERatio ?? overview?.TrailingPE),
    dividend_yield: parseAlphaPercent(overview?.DividendYield),
    fifty_two_week_high: parseAlphaNumber(overview?.["52WeekHigh"]),
    fifty_two_week_low: parseAlphaNumber(overview?.["52WeekLow"]),
    avg_volume: parseAlphaNumber(overview?.AverageVolume),
    beta: parseAlphaNumber(overview?.Beta),
  };
}

async function getAlphaOverview(ticker: string): Promise<AlphaOverviewResponse | null> {
  const key = ticker.toUpperCase();
  const alphaKey = process.env.ALPHAVANTAGE_API_KEY?.trim();
  if (!alphaKey) return null;

  return resolveAlphaWithSWR<AlphaOverviewResponse>({
    ticker: key,
    cacheKey: "alpha-overview-v1",
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    staleWhileRevalidateMs: 30 * 24 * 60 * 60 * 1000,
    fetchFresh: async () => {
      const raw = (await fetchWithRetry(key, "OVERVIEW", alphaKey)) as AlphaOverviewResponse;
      return raw && (raw.Symbol || raw.Name || raw.Description || raw.Exchange) ? raw : null;
    },
    onRefreshError: (error) => {
      console.warn(`[AlphaVantage] Failed to fetch overview for ${key}:`, error);
    },
  });
}

async function getAlphaGlobalQuote(ticker: string): Promise<AlphaGlobalQuoteResponse | null> {
  const key = ticker.toUpperCase();
  const alphaKey = process.env.ALPHAVANTAGE_API_KEY?.trim();
  if (!alphaKey) return null;

  return resolveAlphaWithSWR<AlphaGlobalQuoteResponse>({
    ticker: key,
    cacheKey: "alpha-global-quote-v1",
    ttlMs: 5 * 60 * 1000,
    staleWhileRevalidateMs: 60 * 1000,
    fetchFresh: async () => {
      const raw = (await fetchWithRetry(key, "GLOBAL_QUOTE", alphaKey)) as AlphaGlobalQuoteResponse;
      return raw?.["Global Quote"]?.["05. price"] ? raw : null;
    },
    onRefreshError: (error) => {
      console.warn(`[AlphaVantage] Failed to fetch global quote for ${key}:`, error);
    },
  });
}

async function getAlphaQuoteSnapshot(ticker: string): Promise<StockQuote | null> {
  const [overview, globalQuote] = await Promise.all([
    getAlphaOverview(ticker),
    getAlphaGlobalQuote(ticker),
  ]);

  if (!overview || !globalQuote) return null;

  return mapAlphaToQuote(ticker, overview, globalQuote, null);
}

function nextAlphaEarningsDate(history: AlphaEarningsInsight["history"]): string | null {
  const futureDates = history
    .map((row) => row.report_date)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()) && value.getTime() >= Date.now())
    .sort((a, b) => a.getTime() - b.getTime());

  return futureDates.length > 0 ? futureDates[0].toISOString().split("T")[0] : null;
}

async function buildAlphaEarningsInsight(ticker: string): Promise<AlphaEarningsInsight | null> {
  const key = ticker.toUpperCase();
  const alphaKey = process.env.ALPHAVANTAGE_API_KEY?.trim();
  if (!alphaKey) return null;

  return resolveAlphaWithSWR<AlphaEarningsInsight>({
    ticker: key,
    cacheKey: "alpha-earnings-insight-v2",
    ttlMs: 8 * 60 * 60 * 1000,
    staleWhileRevalidateMs: 24 * 60 * 60 * 1000,
    fetchFresh: async () => {
      const earnings = (await fetchWithRetry(key, "EARNINGS", alphaKey)) as AlphaEarningsResponse;

      const history = (earnings.quarterlyEarnings ?? [])
        .map((row) => {
          const fiscalDate = getDate(row.fiscalDateEnding);
          const reportDate = row.reportedDate ? getDate(row.reportedDate) : null;
          const validFiscal = !Number.isNaN(fiscalDate.getTime());
          const parsedActual = parseNullableNumber(row.reportedEPS);
          const parsedEstimate = parseNullableNumber(row.estimatedEPS);
          const isFutureReport =
            !!reportDate && !Number.isNaN(reportDate.getTime()) && reportDate.getTime() > Date.now();

          const epsActual = isFutureReport && parsedActual === 0 && parsedEstimate !== null
            ? null
            : parsedActual;

          return {
            quarter: validFiscal ? toPeriodLabel(fiscalDate, "quarterly") : "Unknown",
            report_date:
              reportDate && !Number.isNaN(reportDate.getTime())
                ? toDateString(reportDate)
                : null,
            eps_actual: epsActual,
            eps_estimate: parsedEstimate,
            surprise_percent: parseNullableNumber(row.surprisePercentage),
          };
        })
        .filter((row) => row.eps_actual !== null || row.eps_estimate !== null)
        .sort((a, b) => {
          const da = a.report_date ? new Date(a.report_date).getTime() : 0;
          const db = b.report_date ? new Date(b.report_date).getTime() : 0;
          return db - da;
        })
        .slice(0, 16);

      if (history.length === 0) return null;

      const nextWithEstimate = nextAlphaEarningsDate(history);
      const latestWithEstimate = history.find((row) => row.eps_estimate !== null);

      return {
        history,
        est_eps: latestWithEstimate?.eps_estimate ?? null,
        next_earnings_date: nextWithEstimate,
      };
    },
    onRefreshError: (error) => {
      console.warn(`[AlphaVantage] Failed to fetch earnings insight for ${key}:`, error);
    },
  });
}

export async function getStockProfileFromAlphaVantage(
  ticker: string
): Promise<StockProfile | null> {
  const overview = await getAlphaOverview(ticker);
  return overview ? mapAlphaOverviewToProfile(ticker, overview) : null;
}

export async function getStockQuoteFromAlphaVantage(
  ticker: string
): Promise<StockQuote | null> {
  const [snapshot, insight] = await Promise.all([
    getAlphaQuoteSnapshot(ticker),
    buildAlphaEarningsInsight(ticker),
  ]);

  if (!snapshot) return null;

  return {
    ...snapshot,
    next_earnings_date: insight?.next_earnings_date ?? snapshot.next_earnings_date,
  };
}

export async function getBatchQuotesFromAlphaVantage(
  tickers: string[]
): Promise<StockQuote[]> {
  if (tickers.length === 0) return [];

  const uniqueTickers = Array.from(
    new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))
  );

  const results = await Promise.allSettled(
    uniqueTickers.map((ticker) => getAlphaQuoteSnapshot(ticker))
  );

  return results
    .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []));
}

export async function getBatchEarningsInsightsFromAlphaVantage(
  tickers: string[]
): Promise<Record<string, EarningsInsight>> {
  if (tickers.length === 0) return {};

  const uniqueTickers = Array.from(
    new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))
  );

  const results = await Promise.allSettled(
    uniqueTickers.map(async (ticker) => {
      const [profile, alphaInsight] = await Promise.all([
        getStockProfileFromAlphaVantage(ticker),
        buildAlphaEarningsInsight(ticker),
      ]);

      const history = alphaInsight?.history ?? [];
      const insight: EarningsInsight = {
        ticker,
        company_name: profile?.name ?? ticker,
        next_earnings_date: alphaInsight?.next_earnings_date ?? null,
        earnings_timing: "Time TBD",
        est_eps: alphaInsight?.est_eps ?? null,
        est_revenue: null,
        history: history.map((row) => ({
          quarter: row.quarter,
          report_date: row.report_date,
          eps_actual: row.eps_actual,
          eps_estimate: row.eps_estimate,
          revenue_estimate: null,
          revenue_actual: null,
          surprise_percent: row.surprise_percent,
        })),
        investor_relations_url: profile?.website ?? null,
        webcast_url: null,
        source: history.length > 0 ? "alphavantage" : "none",
      };

      return [ticker, insight] as const;
    })
  );

  return results.reduce<Record<string, EarningsInsight>>((acc, result) => {
    if (result.status === "fulfilled") {
      const [ticker, insight] = result.value;
      acc[ticker] = insight;
    }
    return acc;
  }, {});
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAlphaRateLimited<T>(operation: () => Promise<T>): Promise<T> {
  const task = alphaQueue.then(async () => {
    const waitMs = Math.max(0, alphaNextAllowedAt - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    try {
      return await operation();
    } finally {
      alphaNextAllowedAt = Date.now() + ALPHA_MIN_INTERVAL_MS;
    }
  });

  alphaQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

async function fetchWithRetry(
  symbol: string,
  fn: AlphaFunction,
  apiKey: string,
  extraParams?: Record<string, string>
): Promise<AlphaFinancialResponse | AlphaEarningsResponse | AlphaTranscriptResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ALPHA_MAX_RETRIES; attempt += 1) {
    const cooldownWaitMs = getAlphaThrottleUntil(apiKey) - Date.now();
    if (cooldownWaitMs > 0) {
      await sleep(cooldownWaitMs);
    }

    try {
      return await runAlphaRateLimited(() => fetchAlphaFunction(symbol, fn, apiKey, extraParams));
    } catch (error) {
      lastError = error;
      const isThrottled = isAlphaThrottleError(error);
      if (isThrottled) {
        await recordAlphaThrottleState(`AlphaVantage throttled on ${fn}`, apiKey);
        // Surface throttle immediately — no point retrying within the same cooldown window.
        throw error;
      }
      if (attempt === ALPHA_MAX_RETRIES - 1) {
        throw error;
      }

      const waitMs = Math.max(
        ALPHA_THROTTLE_RETRY_MS,
        getAlphaThrottleUntil(apiKey) - Date.now()
      );
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`AlphaVantage ${fn} failed`);
}

async function fetchBundle(symbol: string, apiKey: string): Promise<AlphaBundle> {
  const fetchOptional = async <T extends AlphaFinancialResponse | AlphaEarningsResponse>(
    fn: AlphaFunction
  ): Promise<T | null> => {
    try {
      return (await fetchWithRetry(symbol, fn, apiKey)) as T;
    } catch (error) {
      if (isAlphaThrottleError(error)) throw error;
      return null;
    }
  };

  const income = await fetchOptional<AlphaFinancialResponse>("INCOME_STATEMENT");
  const balance = await fetchOptional<AlphaFinancialResponse>("BALANCE_SHEET");
  const cash = await fetchOptional<AlphaFinancialResponse>("CASH_FLOW");

  const hasEpsInIncome = (rows?: AlphaFinancialReport[]) =>
    (rows ?? []).some((row) => parseNumber(row.dilutedEPS) !== 0 || parseNumber(row.reportedEPS) !== 0);

  const needEarningsFallback =
    !hasEpsInIncome(income?.annualReports) || !hasEpsInIncome(income?.quarterlyReports);

  let earnings: AlphaEarningsResponse = {};
  if (needEarningsFallback) {
    try {
      earnings = (await fetchWithRetry(symbol, "EARNINGS", apiKey)) as AlphaEarningsResponse;
    } catch (error) {
      if (isAlphaThrottleError(error)) throw error;
      earnings = {};
    }
  }

  return {
    income: income ?? {},
    balance: balance ?? {},
    cash: cash ?? {},
    earnings,
  };
}

function toPeriodKey(date: Date, kind: "annual" | "quarterly"): string {
  const year = date.getUTCFullYear();
  if (kind === "annual") return `${year}`;
  const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
  return `${year}-Q${quarter}`;
}

function buildEpsMaps(
  rows: AlphaEarningsPoint[] | undefined,
  kind: "annual" | "quarterly"
): { byDate: Map<string, number>; byPeriod: Map<string, number> } {
  const byDate = new Map<string, number>();
  const byPeriod = new Map<string, number>();
  for (const row of rows ?? []) {
    const date = getDate(row.fiscalDateEnding);
    const dateKey = toDateString(date);
    const periodKey = toPeriodKey(date, kind);
    const value = parseNumber(row.reportedEPS);
    byDate.set(dateKey, value);
    byPeriod.set(periodKey, value);
  }
  return { byDate, byPeriod };
}

function buildSharesPeriodMap(
  rows: BalanceSheet[],
  kind: "annual" | "quarterly"
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const periodDate = getDate(row.date);
    map.set(toPeriodKey(periodDate, kind), row.shares_outstanding);
  }
  return map;
}

export function mapIncome(
  rows: AlphaFinancialReport[] | undefined,
  kind: "annual" | "quarterly",
  epsByDate: Map<string, number>,
  epsByPeriod: Map<string, number>,
  sharesByDate: Map<string, number>,
  sharesByPeriod: Map<string, number>
): IncomeStatement[] {
  return (rows ?? [])
    .map((row) => {
      const date = getDate(row.fiscalDateEnding);
      const dateKey = toDateString(date);
      const periodKey = toPeriodKey(date, kind);
      const netIncome = parseNumber(row.netIncome);
      const revenue = parseNumber(row.totalRevenue);
      const costOfRevenue = firstNumber(row, "costOfRevenue", "costofGoodsAndServicesSold");
      const grossProfit = parseNumber(row.grossProfit) || (revenue && costOfRevenue ? revenue - costOfRevenue : 0);
      const operatingIncome = parseNumber(row.operatingIncome);
      const opex =
        parseNumber(row.operatingExpenses) ||
        firstNumber(row, "sellingGeneralAndAdministrative") + firstNumber(row, "researchAndDevelopment") ||
        (grossProfit && operatingIncome ? grossProfit - operatingIncome : 0);
      const da = firstNumber(row, "depreciationAndAmortization", "depreciationDepletionAndAmortization");
      const sharesRaw = parseNumber(row.commonStockSharesOutstanding);
      const shares =
        sharesRaw ||
        sharesByDate.get(dateKey) ||
        sharesByPeriod.get(periodKey) ||
        0;
      const epsFromIncome = parseNumber(row.dilutedEPS);
      const epsFromEarnings = epsByDate.get(dateKey) ?? epsByPeriod.get(periodKey) ?? 0;
      const epsDiluted = epsFromIncome || epsFromEarnings || 0;
      const epsBasic = parseNumber(row.reportedEPS) || epsDiluted;
      const inferredShares =
        shares > 0 ? shares : epsDiluted !== 0 ? Math.abs(netIncome / epsDiluted) : 0;

      return {
        period: toPeriodLabel(date, kind),
        date: dateKey,
        currency: "USD",
        revenue,
        cost_of_revenue: costOfRevenue,
        gross_profit: grossProfit,
        operating_expenses: opex,
        operating_income: operatingIncome,
        interest_expense: firstNumber(row, "interestExpense", "interestAndDebtExpense"),
        pre_tax_income: parseNumber(row.incomeBeforeTax),
        income_tax: parseNumber(row.incomeTaxExpense),
        net_income: netIncome,
        eps_basic: epsBasic,
        eps_diluted: epsDiluted,
        shares_outstanding_basic: inferredShares,
        shares_outstanding_diluted: inferredShares,
        ebitda: parseNumber(row.ebitda) || (operatingIncome && da ? operatingIncome + da : 0),
      } satisfies IncomeStatement;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function mapBalance(
  rows: AlphaFinancialReport[] | undefined,
  kind: "annual" | "quarterly"
): BalanceSheet[] {
  return (rows ?? [])
    .map((row) => {
      const date = getDate(row.fiscalDateEnding);
      const totalAssets = parseNumber(row.totalAssets);
      const currentAssets = parseNumber(row.totalCurrentAssets);
      const currentLiabilities = parseNumber(row.totalCurrentLiabilities);
      const equity = parseNumber(row.totalShareholderEquity);
      const totalLiabilities = parseNumber(row.totalLiabilities) || (totalAssets && equity ? totalAssets - equity : 0);
      return {
        period: toPeriodLabel(date, kind),
        date: toDateString(date),
        currency: "USD",
        cash_and_equivalents: firstNumber(row, "cashAndCashEquivalentsAtCarryingValue", "cashAndShortTermInvestments"),
        short_term_investments: parseNumber(row.shortTermInvestments),
        total_current_assets: currentAssets,
        total_non_current_assets: parseNumber(row.totalNonCurrentAssets) || (totalAssets && currentAssets ? totalAssets - currentAssets : 0),
        total_assets: totalAssets,
        total_current_liabilities: currentLiabilities,
        long_term_debt: firstNumber(row, "longTermDebt", "longTermDebtNoncurrent"),
        total_non_current_liabilities:
          parseNumber(row.totalNonCurrentLiabilities) || (totalLiabilities && currentLiabilities ? totalLiabilities - currentLiabilities : 0),
        total_liabilities: totalLiabilities,
        total_equity: equity,
        retained_earnings: parseNumber(row.retainedEarnings),
        shares_outstanding: parseNumber(row.commonStockSharesOutstanding),
      } satisfies BalanceSheet;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function mapCashFlow(
  rows: AlphaFinancialReport[] | undefined,
  kind: "annual" | "quarterly"
): CashFlowStatement[] {
  return (rows ?? [])
    .map((row) => {
      const date = getDate(row.fiscalDateEnding);
      const operatingCashFlow = parseNumber(row.operatingCashflow);
      const capex = parseNumber(row.capitalExpenditures);

      return {
        period: toPeriodLabel(date, kind),
        date: toDateString(date),
        currency: "USD",
        operating_cash_flow: operatingCashFlow,
        capital_expenditures: capex,
        free_cash_flow: operatingCashFlow + capex,
        dividends_paid: firstNumber(row, "dividendPayout", "dividendPayoutCommonStock"),
        // Reported as a payment (positive) under one of two keys, or as
        // negative "proceeds"; the chart reads the magnitude either way.
        share_repurchases: firstNumber(row, "paymentsForRepurchaseOfCommonStock", "paymentsForRepurchaseOfEquity", "proceedsFromRepurchaseOfEquity"),
        net_investing: parseNumber(row.cashflowFromInvestment),
        net_financing: parseNumber(row.cashflowFromFinancing),
        net_change_in_cash: parseNumber(row.changeInCashAndCashEquivalents),
      } satisfies CashFlowStatement;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getFinancialsFromAlphaVantage(
  ticker: string,
  apiKey: string
): Promise<CompanyFinancials | null> {
  try {
    const symbol = ticker.toUpperCase();
    const bundle = await fetchBundle(symbol, apiKey);

    const balanceAnnual = mapBalance(bundle.balance.annualReports, "annual");
    const balanceQuarterly = mapBalance(bundle.balance.quarterlyReports, "quarterly");
    const annualSharesByDate = new Map(balanceAnnual.map((row) => [row.date, row.shares_outstanding]));
    const quarterlySharesByDate = new Map(
      balanceQuarterly.map((row) => [row.date, row.shares_outstanding])
    );
    const annualSharesByPeriod = buildSharesPeriodMap(balanceAnnual, "annual");
    const quarterlySharesByPeriod = buildSharesPeriodMap(balanceQuarterly, "quarterly");

    const annualEpsMaps = buildEpsMaps(bundle.earnings.annualEarnings, "annual");
    const quarterlyEpsMaps = buildEpsMaps(bundle.earnings.quarterlyEarnings, "quarterly");

    const incomeAnnual = mapIncome(
      bundle.income.annualReports,
      "annual",
      annualEpsMaps.byDate,
      annualEpsMaps.byPeriod,
      annualSharesByDate,
      annualSharesByPeriod
    );
    const incomeQuarterly = mapIncome(
      bundle.income.quarterlyReports,
      "quarterly",
      quarterlyEpsMaps.byDate,
      quarterlyEpsMaps.byPeriod,
      quarterlySharesByDate,
      quarterlySharesByPeriod
    );
    const cashAnnual = mapCashFlow(bundle.cash.annualReports, "annual");
    const cashQuarterly = mapCashFlow(bundle.cash.quarterlyReports, "quarterly");

    const hasData =
      incomeAnnual.length +
        incomeQuarterly.length +
        balanceAnnual.length +
        balanceQuarterly.length +
        cashAnnual.length +
        cashQuarterly.length >
      0;

    if (!hasData) return null;

    return {
      ticker: symbol,
      income_statement: {
        annual: incomeAnnual,
        quarterly: incomeQuarterly,
      },
      balance_sheet: {
        annual: balanceAnnual,
        quarterly: balanceQuarterly,
      },
      cash_flow: {
        annual: cashAnnual,
        quarterly: cashQuarterly,
      },
    };
  } catch (error) {
    if (isAlphaThrottleError(error)) throw error;
    console.warn(
      `[AlphaVantage] Failed to fetch financials for ${ticker.toUpperCase()}:`,
      error
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// Per-statement fetch (Chart Builder)
// ─────────────────────────────────────────────────────────

export type AlphaStatementKind = "income" | "balance" | "cashflow";

const STATEMENT_FUNCTION: Record<AlphaStatementKind, AlphaFunction> = {
  income: "INCOME_STATEMENT",
  balance: "BALANCE_SHEET",
  cashflow: "CASH_FLOW",
};

const STATEMENT_CACHE_KEY: Record<AlphaStatementKind, string> = {
  income: "alpha-income-v1",
  balance: "alpha-balance-v1",
  cashflow: "alpha-cashflow-v1",
};

const STATEMENT_TTL_MS = 12 * 60 * 60 * 1000;
const STATEMENT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export interface AlphaStatementsOptions {
  /** Only answer from cache; never spend an API call. */
  cachedOnly?: boolean;
}

/**
 * The statements a chart needs and nothing more. Alpha Vantage has no
 * per-field endpoint — INCOME_STATEMENT, BALANCE_SHEET and CASH_FLOW are
 * the finest grain — so asking for one statement instead of the bundle
 * turns three or four calls per ticker into one. Each statement is cached
 * on its own, and a full bundle already in cache answers for any subset.
 *
 * Returns `CompanyFinancials` with only the requested statements filled
 * (the others are empty arrays), or null when `cachedOnly` and something
 * requested is not cached. Throttle errors propagate like everywhere else.
 */
export async function getAlphaStatements(
  ticker: string,
  apiKey: string,
  which: readonly AlphaStatementKind[],
  options: AlphaStatementsOptions = {}
): Promise<CompanyFinancials | null> {
  const symbol = ticker.toUpperCase();
  const wanted = Array.from(new Set(which));
  if (wanted.length === 0) return null;

  const full = await getCachedDataState<CompanyFinancials>(
    symbol,
    "financials-alpha-v2",
    STATEMENT_TTL_MS,
    STATEMENT_STALE_MS
  );
  if (full.status !== "miss" && full.data && full.data.income_statement?.annual?.length) {
    return full.data;
  }

  const raw: Partial<Record<AlphaStatementKind, AlphaFinancialResponse>> = {};
  for (const kind of wanted) {
    const cached = await getCachedDataState<AlphaFinancialResponse>(
      symbol,
      STATEMENT_CACHE_KEY[kind],
      STATEMENT_TTL_MS,
      STATEMENT_STALE_MS
    );
    if (cached.status !== "miss" && cached.data) {
      raw[kind] = cached.data;
      continue;
    }
    if (options.cachedOnly) return null;
    const response = (await fetchWithRetry(symbol, STATEMENT_FUNCTION[kind], apiKey)) as AlphaFinancialResponse;
    if (response.annualReports?.length || response.quarterlyReports?.length) {
      await setCachedData(symbol, STATEMENT_CACHE_KEY[kind], response as unknown as Record<string, unknown>);
    }
    raw[kind] = response;
  }

  const balanceAnnual = raw.balance ? mapBalance(raw.balance.annualReports, "annual") : [];
  const balanceQuarterly = raw.balance ? mapBalance(raw.balance.quarterlyReports, "quarterly") : [];

  let incomeAnnual: IncomeStatement[] = [];
  let incomeQuarterly: IncomeStatement[] = [];
  if (raw.income) {
    const hasEps = (rows?: AlphaFinancialReport[]) =>
      (rows ?? []).some((row) => parseNumber(row.dilutedEPS) !== 0 || parseNumber(row.reportedEPS) !== 0);
    let earnings: AlphaEarningsResponse = {};
    if (!options.cachedOnly && (!hasEps(raw.income.annualReports) || !hasEps(raw.income.quarterlyReports))) {
      try {
        earnings = (await fetchWithRetry(symbol, "EARNINGS", apiKey)) as AlphaEarningsResponse;
      } catch (error) {
        if (isAlphaThrottleError(error)) throw error;
      }
    }
    const annualEps = buildEpsMaps(earnings.annualEarnings, "annual");
    const quarterlyEps = buildEpsMaps(earnings.quarterlyEarnings, "quarterly");
    incomeAnnual = mapIncome(
      raw.income.annualReports,
      "annual",
      annualEps.byDate,
      annualEps.byPeriod,
      new Map(balanceAnnual.map((row) => [row.date, row.shares_outstanding])),
      buildSharesPeriodMap(balanceAnnual, "annual")
    );
    incomeQuarterly = mapIncome(
      raw.income.quarterlyReports,
      "quarterly",
      quarterlyEps.byDate,
      quarterlyEps.byPeriod,
      new Map(balanceQuarterly.map((row) => [row.date, row.shares_outstanding])),
      buildSharesPeriodMap(balanceQuarterly, "quarterly")
    );
  }

  const cashAnnual = raw.cashflow ? mapCashFlow(raw.cashflow.annualReports, "annual") : [];
  const cashQuarterly = raw.cashflow ? mapCashFlow(raw.cashflow.quarterlyReports, "quarterly") : [];

  const rows =
    incomeAnnual.length + incomeQuarterly.length + balanceAnnual.length + balanceQuarterly.length + cashAnnual.length + cashQuarterly.length;
  if (rows === 0) return null;

  return {
    ticker: symbol,
    income_statement: { annual: incomeAnnual, quarterly: incomeQuarterly },
    balance_sheet: { annual: balanceAnnual, quarterly: balanceQuarterly },
    cash_flow: { annual: cashAnnual, quarterly: cashQuarterly },
  };
}

export async function getEarningsInsightFromAlphaVantage(
  ticker: string,
  apiKey: string
): Promise<AlphaEarningsInsight | null> {
  const symbol = ticker.toUpperCase();

  let earnings: AlphaEarningsResponse;
  try {
    earnings = (await fetchWithRetry(symbol, "EARNINGS", apiKey)) as AlphaEarningsResponse;
  } catch (error) {
    if (isAlphaThrottleError(error)) throw error;
    return null;
  }

  const history = (earnings.quarterlyEarnings ?? [])
    .map((row) => {
      const fiscalDate = getDate(row.fiscalDateEnding);
      const reportDate = row.reportedDate ? getDate(row.reportedDate) : null;
      const validFiscal = !Number.isNaN(fiscalDate.getTime());
      const parsedActual = parseNullableNumber(row.reportedEPS);
      const parsedEstimate = parseNullableNumber(row.estimatedEPS);
      const isFutureReport =
        !!reportDate && !Number.isNaN(reportDate.getTime()) && reportDate.getTime() > Date.now();

      // Alpha can emit placeholder 0.00 for not-yet-reported quarters.
      const epsActual = isFutureReport && parsedActual === 0 && parsedEstimate !== null
        ? null
        : parsedActual;

      return {
        quarter: validFiscal ? toPeriodLabel(fiscalDate, "quarterly") : "Unknown",
        report_date:
          reportDate && !Number.isNaN(reportDate.getTime())
            ? toDateString(reportDate)
            : null,
        eps_actual: epsActual,
        eps_estimate: parsedEstimate,
        surprise_percent: parseNullableNumber(row.surprisePercentage),
      };
    })
    .filter((row) => row.eps_actual !== null || row.eps_estimate !== null)
    .sort((a, b) => {
      const da = a.report_date ? new Date(a.report_date).getTime() : 0;
      const db = b.report_date ? new Date(b.report_date).getTime() : 0;
      return db - da;
    })
    .slice(0, 16);

  if (history.length === 0) return null;

  const nextWithEstimate = history.find(
    (row) => row.eps_estimate !== null && row.report_date && new Date(row.report_date).getTime() >= Date.now()
  );
  const latestWithEstimate = history.find((row) => row.eps_estimate !== null);

  return {
    history,
    est_eps: nextWithEstimate?.eps_estimate ?? latestWithEstimate?.eps_estimate ?? null,
    next_earnings_date: nextWithEstimate?.report_date ?? null,
  };
}

/**
 * Fetches quarterly revenue from Alpha Vantage INCOME_STATEMENT and returns a map
 * keyed by period label ("Q4 2025") → revenue (number).
 *
 * Used by the earnings-detail flow to populate revenue_actual when the full
 * financials cache (financials-alpha-v2) is unavailable — so revenue always comes
 * from the same Alpha Vantage source as EPS without relying on a separate cache
 * being pre-populated.
 */
export async function getQuarterlyRevenueMapFromAlpha(
  ticker: string,
  apiKey: string
): Promise<Map<string, number> | null> {
  const symbol = ticker.toUpperCase();
  try {
    const income = (await fetchWithRetry(symbol, "INCOME_STATEMENT", apiKey)) as AlphaFinancialResponse;
    const rows = income.quarterlyReports ?? [];
    if (rows.length === 0) return null;

    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.fiscalDateEnding) continue;
      const date = getDate(row.fiscalDateEnding);
      if (Number.isNaN(date.getTime())) continue;
      const revenue = parseNumber(row.totalRevenue);
      if (revenue > 0) {
        // Key by period label ("Q4 2025") — same format produced by toPeriodLabel()
        // in getEarningsInsightFromAlphaVantage, so both sides always agree.
        map.set(toPeriodLabel(date, "quarterly"), revenue);
      }
    }
    return map.size > 0 ? map : null;
  } catch (error) {
    if (isAlphaThrottleError(error)) throw error;
    return null;
  }
}

export async function getEarningsCallTranscriptFromAlphaVantage(
  ticker: string,
  year: number,
  quarter: number,
  apiKey: string
): Promise<AlphaTranscriptDocument | null> {
  const symbol = ticker.toUpperCase();
  const normalizedQuarter = Math.min(Math.max(Math.trunc(quarter), 1), 4);
  const variants: Array<Record<string, string>> = [
    { quarter: `${year}Q${normalizedQuarter}` },
    { quarter: `Q${normalizedQuarter}`, year: String(year) },
    { quarter: String(normalizedQuarter), year: String(year) },
  ];

  for (const params of variants) {
    try {
      const raw = (await fetchWithRetry(
        symbol,
        "EARNINGS_CALL_TRANSCRIPT",
        apiKey,
        params
      )) as AlphaTranscriptResponse | AlphaTranscriptResponse[];

      const payload = Array.isArray(raw) ? raw[0] : raw;
      if (!payload) continue;

      const rawContent = payload.content ?? payload.transcript ?? "";
      const content = rawContent.trim();
      if (!content) continue;

      const parsedDate = payload.date ? getDate(payload.date) : null;
      const publishedAt =
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? toDateString(parsedDate)
          : null;

      return {
        ticker: symbol,
        year,
        quarter: normalizedQuarter,
        published_at: publishedAt,
        content,
      };
    } catch {
      continue;
    }
  }

  return null;
}
