import { FEATURES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBatchEarningsInsightsFromAlphaVantage,
  getFinancialsFromAlphaVantage,
  getStockProfileFromAlphaVantage,
  getStockQuoteFromAlphaVantage,
} from "@/lib/api/alphavantage";
import * as mock from "@/lib/mock-data";
import type { EarningsInsight, StockProfile, StockQuote } from "@/types/stock";
import type { CompanyFinancials } from "@/types/financials";

const EARNINGS_DETAIL_CACHE_KEY = "earnings-detail-v1";
const EARNINGS_DETAIL_TTL_MS = 24 * 60 * 60 * 1000;

export interface EarningsDetailData {
  ticker: string;
  profile: StockProfile | null;
  quote: StockQuote | null;
  financials: CompanyFinancials | null;
  insight: EarningsInsight;
  cached: boolean;
  fetched_at: string;
}

interface StockCacheRow {
  data: EarningsDetailData;
  last_updated: string;
}

interface CachedEarningsDetailResult {
  payload: EarningsDetailData;
  stale: boolean;
}

function hasSufficientCachedDetail(payload: EarningsDetailData): boolean {
  const history = payload.insight?.history ?? [];
  if (history.length < 4) return false;

  const reportedCount = history.filter((row) => row.eps_actual != null).length;
  const estimateCount = history.filter((row) => row.eps_estimate != null).length;
  return reportedCount >= 2 || estimateCount >= 1;
}

function buildEmptyInsight(ticker: string): EarningsInsight {
  return {
    ticker,
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
}

async function readEarningsDetailFromCache(
  ticker: string
): Promise<CachedEarningsDetailResult | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("stock_cache")
      .select("data,last_updated")
      .eq("ticker", ticker)
      .eq("cache_key", EARNINGS_DETAIL_CACHE_KEY)
      .single();

    if (error || !data) return null;

    const row = data as unknown as StockCacheRow;
    const lastUpdated = new Date(row.last_updated).getTime();
    if (!Number.isFinite(lastUpdated)) return null;

    if (Date.now() - lastUpdated > EARNINGS_DETAIL_TTL_MS) {
      const payload = {
        ...row.data,
        ticker,
        cached: true,
      };

      if (!hasSufficientCachedDetail(payload)) {
        return null;
      }

      return {
        payload,
        stale: true,
      };
    }

    const payload = {
      ...row.data,
      ticker,
      cached: true,
    };

    if (!hasSufficientCachedDetail(payload)) {
      return null;
    }

    return {
      payload,
      stale: false,
    };
  } catch {
    return null;
  }
}

async function writeEarningsDetailToCache(
  ticker: string,
  payload: EarningsDetailData
): Promise<void> {
  try {
    const supabase = createAdminClient();

    await supabase.from("stock_cache").upsert(
      {
        ticker,
        cache_key: EARNINGS_DETAIL_CACHE_KEY,
        data: payload,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "ticker,cache_key" }
    );
  } catch {
    // Non-blocking: API data is still returned to caller.
  }
}

async function fetchFreshEarningsDetail(ticker: string): Promise<EarningsDetailData> {
  const [profile, quote, insightMap, financials] = await Promise.all([
    FEATURES.ENABLE_REAL_API ? getStockProfileFromAlphaVantage(ticker) : mock.getStockProfile(ticker),
    FEATURES.ENABLE_REAL_API ? getStockQuoteFromAlphaVantage(ticker) : mock.getStockQuote(ticker),
    FEATURES.ENABLE_REAL_API
      ? getBatchEarningsInsightsFromAlphaVantage([ticker])
      : Promise.resolve({ [ticker]: buildEmptyInsight(ticker) }),
    FEATURES.ENABLE_REAL_API
      ? getFinancialsFromAlphaVantage(ticker, process.env.ALPHAVANTAGE_API_KEY?.trim() ?? "")
      : mock.getCompanyFinancials(ticker),
  ]);

  const mergedInsight: EarningsInsight = insightMap[ticker] ?? buildEmptyInsight(ticker);

  return {
    ticker,
    profile,
    quote,
    financials,
    insight: mergedInsight,
    cached: false,
    fetched_at: new Date().toISOString(),
  };
}

async function refreshEarningsDetailCache(ticker: string): Promise<void> {
  try {
    const fresh = await fetchFreshEarningsDetail(ticker);
    await writeEarningsDetailToCache(ticker, fresh);
  } catch {
    // Background refresh must never block the user path.
  }
}

export async function getEarningsDetailData(
  ticker: string
): Promise<EarningsDetailData> {
  const key = ticker.toUpperCase();

  const cached = await readEarningsDetailFromCache(key);
  if (cached) {
    if (cached.stale) {
      void refreshEarningsDetailCache(key);
    }

    return cached.payload;
  }

  const fresh = await fetchFreshEarningsDetail(key);
  await writeEarningsDetailToCache(key, fresh);
  return fresh;
}

export async function prewarmEarningsDetailCacheForTickers(
  tickers: string[]
): Promise<{ total: number; warmed: number; failed: string[] }> {
  const symbols = Array.from(
    new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))
  );

  const failed: string[] = [];
  let warmed = 0;

  // Keep concurrency conservative to avoid external API throttling.
  const CONCURRENCY = 4;
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const chunk = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((ticker) => getEarningsDetailData(ticker)));

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        warmed += 1;
      } else {
        failed.push(chunk[index]);
      }
    });
  }

  return {
    total: symbols.length,
    warmed,
    failed,
  };
}