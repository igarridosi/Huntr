import { FEATURES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import * as yahoo from "@/lib/api/yahoo";
import * as mock from "@/lib/mock-data";
import {
  getEarningsInsightFromAlphaVantage,
  isAlphaThrottleError,
  readAlphaThrottleState,
} from "@/lib/api/alphavantage";
import { getCachedDataState } from "@/lib/api/cache";
import { getQuarterlyMetricsFromYfinance } from "@/lib/api/yfinance";
import type {
  EarningsHistoryPoint,
  EarningsInsight,
  StockProfile,
  StockQuote,
} from "@/types/stock";
import type { CompanyFinancials } from "@/types/financials";

const EARNINGS_DETAIL_CACHE_KEY = "earnings-alpha-v1";
const EARNINGS_DETAIL_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HISTORY_LIMIT = 16;
const MAX_HISTORY_LIMIT = 20;

interface AlphaEarningsCacheRow {
  fiscal_date: string;
  report_date: string | null;
  quarter?: string | null;
  eps_actual: number | null;
  eps_estimate: number | null;
  revenue_actual: number | null;
  revenue_estimate: number | null;
}

interface AlphaEarningsCachePayload {
  ticker: string;
  rows: AlphaEarningsCacheRow[];
  next_estimate?: AlphaEarningsCacheRow | null;
  fetched_at?: string;
}

export interface EarningsDetailData {
  ticker: string;
  profile: StockProfile | null;
  quote: StockQuote | null;
  financials: CompanyFinancials | null;
  insight: EarningsInsight;
  cached: boolean;
  fetched_at: string;
  history_incomplete?: boolean;
  available_quarters?: number;
  data_error?: string;
}

function clampHistoryLimit(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  if (normalized <= 0) return null;
  return Math.min(normalized, MAX_HISTORY_LIMIT);
}

function sameHistoryRow(a: { quarter: string; report_date: string | null }, b: { quarter: string; report_date: string | null }): boolean {
  return a.quarter === b.quarter && a.report_date === b.report_date;
}

function sliceInsightHistoryWithNextEstimate(history: EarningsInsight["history"], limit: number): EarningsInsight["history"] {
  const actualRows = history
    .filter((row) => row.eps_actual != null || row.revenue_actual != null)
    .sort((a, b) => quarterLabelToTimestamp(b.quarter) - quarterLabelToTimestamp(a.quarter))
    .slice(0, limit);

  const latestActualTs = actualRows.length > 0
    ? Math.max(...actualRows.map((row) => quarterLabelToTimestamp(row.quarter)))
    : 0;

  const nextEstimate = history
    .filter((row) => {
      if (row.eps_actual != null || row.revenue_actual != null) return false;
      if (row.eps_estimate == null && row.revenue_estimate == null) return false;
      return quarterLabelToTimestamp(row.quarter) > latestActualTs;
    })
    .sort((a, b) => quarterLabelToTimestamp(a.quarter) - quarterLabelToTimestamp(b.quarter))[0];

  if (!nextEstimate || actualRows.some((row) => sameHistoryRow(row, nextEstimate))) {
    return actualRows;
  }

  return [nextEstimate, ...actualRows];
}

function trimFinancialsForEarningsView(
  financials: CompanyFinancials | null,
  limit: number
): CompanyFinancials | null {
  if (!financials) return null;

  const annualKeep = Math.max(2, Math.ceil(limit / 4));

  return {
    ticker: financials.ticker,
    income_statement: {
      annual: financials.income_statement.annual.slice(-annualKeep),
      quarterly: financials.income_statement.quarterly.slice(-limit),
    },
    // Earnings detail panel only needs income statement data.
    balance_sheet: {
      annual: [],
      quarterly: [],
    },
    cash_flow: {
      annual: [],
      quarterly: [],
    },
  };
}

function applyHistoryLimitToDetail(
  payload: EarningsDetailData,
  historyLimit?: number
): EarningsDetailData {
  const effectiveLimit = clampHistoryLimit(historyLimit);
  if (effectiveLimit == null || effectiveLimit >= DEFAULT_HISTORY_LIMIT) {
    return payload;
  }

  return {
    ...payload,
    insight: {
      ...payload.insight,
      history: sliceInsightHistoryWithNextEstimate(payload.insight.history, effectiveLimit),
    },
    financials: trimFinancialsForEarningsView(payload.financials, effectiveLimit),
  };
}

interface StockCacheRow {
  data: AlphaEarningsCachePayload;
  last_updated: string;
}

async function readAlphaEarningsCache(
  ticker: string
): Promise<AlphaEarningsCachePayload | null> {
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
      return null;
    }

    return row.data;
  } catch {
    return null;
  }
}

async function writeAlphaEarningsCache(ticker: string, payload: AlphaEarningsCachePayload): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("stock_cache").upsert(
      {
        ticker: ticker.toUpperCase(),
        cache_key: EARNINGS_DETAIL_CACHE_KEY,
        data: payload,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "ticker,cache_key" }
    );
  } catch (err) {
    // non-fatal: best-effort cache write
    console.warn("Failed to write Alpha earnings cache:", err);
  }
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

function quarterLabelFromDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
}

function quarterLabelToTimestamp(label: string): number {
  const match = /^Q([1-4])\s+(\d{4})$/.exec(label.trim());
  if (!match) return 0;

  const quarter = Number(match[1]);
  const year = Number(match[2]);
  return Date.UTC(year, (quarter - 1) * 3, 1);
}

function resolveQuarterDate(quarter: string, fallback?: string | null): string {
  if (fallback) return fallback;
  const ts = quarterLabelToTimestamp(quarter);
  if (!Number.isFinite(ts) || ts <= 0) return "1970-01-01";
  return new Date(ts).toISOString().slice(0, 10);
}

function normalizeQuarterLabel(raw: string | null | undefined, dateFallback?: string | null): string {
  if (raw && /^Q[1-4]\s+\d{4}$/.test(raw.trim())) return raw.trim();
  if (dateFallback) return quarterLabelFromDate(dateFallback);
  return raw ?? "Unknown";
}

function inferSurprise(actual: number | null, estimate: number | null): number | null {
  if (
    actual == null ||
    estimate == null ||
    !Number.isFinite(actual) ||
    !Number.isFinite(estimate) ||
    Math.abs(estimate) < 1e-9
  ) {
    return null;
  }

  return ((actual - estimate) / Math.abs(estimate)) * 100;
}

type MergedQuarterRow = {
  close_date: string;
  quarter: string;
  revenue: number | null;
  revenue_estimate: number | null;
  eps: number | null;
  eps_estimate: number | null;
  eps_reported: number | null;
};

function selectFutureEstimateRow(rows: MergedQuarterRow[]): MergedQuarterRow | null {
  const now = Date.now();
  const candidates = rows.filter((row) => {
    const hasActuals = row.eps != null || row.revenue != null;
    if (hasActuals) return false;
    const ts = new Date(`${row.close_date}T00:00:00Z`).getTime();
    return Number.isFinite(ts) && ts >= now;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aTs = a.close_date ? new Date(`${a.close_date}T00:00:00Z`).getTime() : 0;
    const bTs = b.close_date ? new Date(`${b.close_date}T00:00:00Z`).getTime() : 0;
    return aTs - bTs;
  });

  return candidates[0];
}

function finalizeMergedRows(rows: MergedQuarterRow[], limit: number): MergedQuarterRow[] {
  const actualRows = rows.filter((row) => row.eps != null || row.revenue != null);
  actualRows.sort((a, b) => quarterLabelToTimestamp(b.quarter) - quarterLabelToTimestamp(a.quarter));

  const capped = actualRows.slice(0, limit);
  const futureEstimate = selectFutureEstimateRow(rows);

  if (futureEstimate && !capped.some((row) => row.quarter === futureEstimate.quarter)) {
    capped.push(futureEstimate);
  }

  return capped.sort((a, b) => quarterLabelToTimestamp(b.quarter) - quarterLabelToTimestamp(a.quarter));
}

function buildFinancialsFromMetrics(
  ticker: string,
  rows: MergedQuarterRow[]
): CompanyFinancials {
  const quarterly = rows
    .map((row) => ({
      period: row.quarter || quarterLabelFromDate(row.close_date),
      date: row.close_date,
      currency: "USD",
      revenue: row.revenue ?? 0,
      cost_of_revenue: 0,
      gross_profit: 0,
      operating_expenses: 0,
      operating_income: 0,
      interest_expense: 0,
      pre_tax_income: 0,
      income_tax: 0,
      net_income: 0,
      eps_basic: row.eps ?? 0,
      eps_diluted: row.eps ?? 0,
      shares_outstanding_basic: 0,
      shares_outstanding_diluted: 0,
      ebitda: 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    ticker: ticker.toUpperCase(),
    income_statement: {
      annual: [],
      quarterly,
    },
    balance_sheet: {
      annual: [],
      quarterly: [],
    },
    cash_flow: {
      annual: [],
      quarterly: [],
    },
  };
}

function buildInsightFromMergedRows(
  ticker: string,
  rows: MergedQuarterRow[],
  profile: StockProfile | null,
  quote: StockQuote | null,
  nextEarningsDate: string | null
): EarningsInsight {
  const history: EarningsHistoryPoint[] = rows.map((row) => ({
    quarter: row.quarter,
    report_date: row.close_date,
    eps_actual: row.eps,
    eps_estimate: row.eps_estimate,
    revenue_estimate: row.revenue_estimate,
    revenue_actual: row.revenue,
    surprise_percent: inferSurprise(row.eps, row.eps_estimate),
  }));

  const nextEstimate = history.find(
    (row) => row.eps_estimate != null && row.eps_actual == null
  );
  const latestEstimate = history.find((row) => row.eps_estimate != null);

  return {
    ticker: ticker.toUpperCase(),
    company_name: profile?.name ?? ticker.toUpperCase(),
    next_earnings_date: nextEarningsDate ?? quote?.next_earnings_date ?? null,
    earnings_timing: quote?.earnings_timing ?? "Time TBD",
    est_eps: nextEstimate?.eps_estimate ?? latestEstimate?.eps_estimate ?? null,
    est_revenue: null,
    history,
    investor_relations_url: profile?.website ?? null,
    webcast_url: profile?.website ?? null,
    source: "alphavantage",
  };
}

async function fetchFreshEarningsDetail(ticker: string, historyLimit?: number): Promise<EarningsDetailData> {
  const profilePromise = FEATURES.ENABLE_REAL_API
    ? yahoo.getProfile(ticker)
    : mock.getStockProfile(ticker);
  const quotePromise = FEATURES.ENABLE_REAL_API
    ? yahoo.getPrice(ticker)
    : mock.getStockQuote(ticker);
  const [profile, quote] = await Promise.all([profilePromise, quotePromise]);
  let dataError: string | null = null;

  let financials: CompanyFinancials | null = null;
  let insight: EarningsInsight = buildEmptyInsight(ticker);
  let historyIncomplete = false;
  let availableQuarters = 0;
  // Preview requests (≤6 quarters) skip Alpha Vantage and use Yahoo Finance directly for speed.
  // Full history requests (>6 quarters) use Alpha Vantage (cached in Supabase).
  const isPreviewMode = typeof historyLimit === "number" && historyLimit <= 6;

  if (FEATURES.ENABLE_REAL_API) {
    let cachePayload = await readAlphaEarningsCache(ticker.toUpperCase());
    if (!isPreviewMode && (!cachePayload || !Array.isArray(cachePayload.rows) || cachePayload.rows.length === 0)) {
      const alphaKey = process.env.ALPHAVANTAGE_API_KEY?.trim();
      const throttleState = alphaKey ? await readAlphaThrottleState(alphaKey) : null;
      if (throttleState) {
        dataError = "Alpha Vantage is currently rate-limited. Yahoo preview remains available.";
      }
      if (alphaKey && !throttleState) {
        try {
          const [alphaInsight, alphaFinancialsCached] = await Promise.all([
            getEarningsInsightFromAlphaVantage(ticker, alphaKey),
            getCachedDataState<CompanyFinancials>(
              ticker.toUpperCase(),
              "financials-alpha-v2",
              12 * 60 * 60 * 1000,
              7 * 24 * 60 * 60 * 1000
            ),
          ]);
          const alphaFinancials =
            alphaFinancialsCached.status !== "miss" && alphaFinancialsCached.data
              ? alphaFinancialsCached.data
              : null;

          if (alphaInsight && Array.isArray(alphaInsight.history) && alphaInsight.history.length > 0) {
            const incomeRows = (alphaFinancials?.income_statement?.quarterly ?? []).map((r) => ({
              date: r.date,
              revenue: r.revenue,
              period: r.period,
            }));

            const rows = alphaInsight.history.map((h) => {
              const matched = incomeRows.find(
                (ir) => ir.period === h.quarter || ir.date === h.report_date
              );
              return {
                fiscal_date: matched?.date ?? h.report_date ?? null,
                report_date: h.report_date ?? null,
                quarter: h.quarter ?? null,
                eps_actual: h.eps_actual ?? null,
                eps_estimate: h.eps_estimate ?? null,
                revenue_actual: matched?.revenue ?? null,
                revenue_estimate: null,
              } as AlphaEarningsCacheRow;
            });

            let nextEstimate: AlphaEarningsCacheRow | null = alphaInsight.next_earnings_date
              ? ({
                  fiscal_date: alphaInsight.next_earnings_date,
                  report_date: alphaInsight.next_earnings_date,
                  quarter: normalizeQuarterLabel(null, alphaInsight.next_earnings_date),
                  eps_actual: null,
                  eps_estimate: alphaInsight.est_eps ?? null,
                  revenue_actual: null,
                  revenue_estimate: null,
                } as AlphaEarningsCacheRow)
              : null;

            // If Alpha provided limited history, attempt to enrich with yfinance (estimates + revenue)
            if (rows.length < DEFAULT_HISTORY_LIMIT) {
              try {
                const yf = await getQuarterlyMetricsFromYfinance(ticker, DEFAULT_HISTORY_LIMIT);
                if (yf && Array.isArray(yf.rows) && yf.rows.length > 0) {
                  const mergedMap = new Map<string, AlphaEarningsCacheRow>();

                  const keyFor = (r: AlphaEarningsCacheRow) => r.fiscal_date ?? r.quarter ?? r.report_date ?? "";

                  // seed with alpha rows
                  for (const r of rows) {
                    const k = keyFor(r) || `${r.quarter}-${r.report_date}`;
                    mergedMap.set(k, { ...r });
                  }

                  // merge yfinance rows: map yfinance rows to AlphaEarningsCacheRow shape
                  for (const y of yf.rows) {
                    const fiscal = y.close_date ?? y.quarter ?? null;
                    const k = fiscal ?? `${y.quarter}-${y.close_date}`;
                    const existing = mergedMap.get(k);
                    const yRow: AlphaEarningsCacheRow = {
                      fiscal_date: y.close_date ?? null,
                      report_date: y.close_date ?? null,
                      quarter: y.quarter ?? null,
                      eps_actual: y.eps ?? null,
                      eps_estimate: y.eps_estimate ?? null,
                      revenue_actual: y.revenue ?? null,
                      revenue_estimate: null,
                    };

                    if (!existing) {
                      mergedMap.set(k, yRow);
                    } else {
                      // prefer alpha values when present, otherwise fill from yfinance
                      mergedMap.set(k, {
                        fiscal_date: existing.fiscal_date ?? yRow.fiscal_date,
                        report_date: existing.report_date ?? yRow.report_date,
                        quarter: existing.quarter ?? yRow.quarter,
                        eps_actual: existing.eps_actual ?? yRow.eps_actual,
                        eps_estimate: existing.eps_estimate ?? yRow.eps_estimate,
                        revenue_actual: existing.revenue_actual ?? yRow.revenue_actual,
                        revenue_estimate: existing.revenue_estimate ?? yRow.revenue_estimate,
                      });
                    }
                  }

                  // build merged list sorted most-recent first by fiscal_date or quarter
                  const mergedRows = Array.from(mergedMap.values())
                    .map((r) => ({
                      row: r,
                      ts: r.fiscal_date ? new Date(r.fiscal_date).getTime() : quarterLabelToTimestamp(r.quarter ?? "Unknown"),
                    }))
                    .sort((a, b) => b.ts - a.ts)
                    .slice(0, DEFAULT_HISTORY_LIMIT)
                    .map((v) => v.row);

                  rows.length = 0;
                  rows.push(...mergedRows);

                  // if yf provides a next estimate, prefer it
                  if (!nextEstimate && yf.next_earnings_date) {
                    nextEstimate = ({
                      fiscal_date: yf.next_earnings_date,
                      report_date: yf.next_earnings_date,
                      quarter: normalizeQuarterLabel(null, yf.next_earnings_date),
                      eps_actual: null,
                      eps_estimate: yf.rows?.find((r) => r.close_date === yf.next_earnings_date)?.eps_estimate ?? null,
                      revenue_actual: null,
                      revenue_estimate: null,
                    } as AlphaEarningsCacheRow);
                  }
                }
              } catch (err) {
                // ignore yfinance failures - alpha is authoritative
              }
            }

            const payload: AlphaEarningsCachePayload = {
              ticker: ticker.toUpperCase(),
              rows,
              next_estimate: nextEstimate,
              fetched_at: new Date().toISOString(),
            };

            await writeAlphaEarningsCache(ticker, payload);
            cachePayload = payload;
          } else {
            dataError = "Alpha Vantage cache missing. Run the sync job to populate earnings data.";
          }
        } catch (err) {
          dataError = isAlphaThrottleError(err)
            ? "Alpha Vantage is currently rate-limited. Yahoo preview remains available."
            : "Alpha Vantage fetch failed. Try again later.";
        }
      } else if (!throttleState) {
        dataError = "Alpha Vantage cache missing. Run the sync job to populate earnings data.";
      }
    }

    // Process cachePayload into financials/insight (from cache hit OR fresh Alpha fetch)
    if (cachePayload && Array.isArray(cachePayload.rows) && cachePayload.rows.length > 0 && insight.history.length === 0) {
      // If cache is incomplete, attempt a best-effort enrichment from yfinance (only on full history requests)
      if (!isPreviewMode && !dataError && cachePayload.rows.length < DEFAULT_HISTORY_LIMIT) {
        try {
          const yf = await getQuarterlyMetricsFromYfinance(ticker, DEFAULT_HISTORY_LIMIT);
          if (yf && Array.isArray(yf.rows) && yf.rows.length > 0) {
            const existingMap = new Map<string, AlphaEarningsCacheRow>();
            const keyFor = (r: AlphaEarningsCacheRow) => r.fiscal_date ?? r.quarter ?? r.report_date ?? "";
            for (const r of cachePayload.rows) {
              existingMap.set(keyFor(r) || `${r.quarter}-${r.report_date}`, { ...r });
            }

            for (const y of yf.rows) {
              const fiscal = y.close_date ?? y.quarter ?? null;
              const k = fiscal ?? `${y.quarter}-${y.close_date}`;
              const existing = existingMap.get(k);
              const yRow: AlphaEarningsCacheRow = {
                fiscal_date: y.close_date ?? null,
                report_date: y.close_date ?? null,
                quarter: y.quarter ?? null,
                eps_actual: y.eps ?? null,
                eps_estimate: y.eps_estimate ?? null,
                revenue_actual: y.revenue ?? null,
                revenue_estimate: null,
              };

              if (!existing) existingMap.set(k, yRow);
              else {
                existingMap.set(k, {
                  fiscal_date: existing.fiscal_date ?? yRow.fiscal_date,
                  report_date: existing.report_date ?? yRow.report_date,
                  quarter: existing.quarter ?? yRow.quarter,
                  eps_actual: existing.eps_actual ?? yRow.eps_actual,
                  eps_estimate: existing.eps_estimate ?? yRow.eps_estimate,
                  revenue_actual: existing.revenue_actual ?? yRow.revenue_actual,
                  revenue_estimate: existing.revenue_estimate ?? yRow.revenue_estimate,
                });
              }
            }

            const merged = Array.from(existingMap.values())
              .map((r) => ({ r, ts: r.fiscal_date ? new Date(r.fiscal_date).getTime() : quarterLabelToTimestamp(r.quarter ?? "Unknown") }))
              .sort((a, b) => b.ts - a.ts)
              .slice(0, DEFAULT_HISTORY_LIMIT)
              .map((v) => v.r);

            cachePayload.rows = merged;
            if (!cachePayload.next_estimate && yf.next_earnings_date) {
              cachePayload.next_estimate = ({
                fiscal_date: yf.next_earnings_date,
                report_date: yf.next_earnings_date,
                quarter: normalizeQuarterLabel(null, yf.next_earnings_date),
                eps_actual: null,
                eps_estimate: yf.rows?.find((r) => r.close_date === yf.next_earnings_date)?.eps_estimate ?? null,
                revenue_actual: null,
                revenue_estimate: null,
              } as AlphaEarningsCacheRow);
            }

            await writeAlphaEarningsCache(ticker, cachePayload);
          }
        } catch {
          // ignore enrichment errors
        }
      }

      const mergedRows: MergedQuarterRow[] = cachePayload.rows.map((row) => {
        const quarter = normalizeQuarterLabel(row.quarter ?? null, row.fiscal_date);
        return {
          close_date: resolveQuarterDate(quarter, row.fiscal_date),
          quarter,
          revenue: row.revenue_actual ?? null,
          revenue_estimate: row.revenue_estimate ?? null,
          eps: row.eps_actual ?? null,
          eps_estimate: row.eps_estimate ?? null,
          eps_reported: row.eps_actual ?? null,
        };
      });

      if (cachePayload.next_estimate) {
        const nextQuarter = normalizeQuarterLabel(
          cachePayload.next_estimate.quarter ?? null,
          cachePayload.next_estimate.fiscal_date
        );
        mergedRows.push({
          close_date: resolveQuarterDate(nextQuarter, cachePayload.next_estimate.fiscal_date),
          quarter: nextQuarter,
          revenue: null,
          revenue_estimate: cachePayload.next_estimate.revenue_estimate ?? null,
          eps: null,
          eps_estimate: cachePayload.next_estimate.eps_estimate ?? null,
          eps_reported: null,
        });
      }

      const finalized = finalizeMergedRows(mergedRows, DEFAULT_HISTORY_LIMIT);
      financials = buildFinancialsFromMetrics(ticker, finalized);
      insight = buildInsightFromMergedRows(
        ticker,
        finalized,
        profile,
        quote,
        quote?.next_earnings_date ?? null
      );

      const actualCount = finalized.filter((row) => row.eps != null || row.revenue != null).length;
      historyIncomplete = actualCount < DEFAULT_HISTORY_LIMIT;
      availableQuarters = actualCount;
      dataError = null;
    }

    // Yahoo Finance fallback if Alpha Vantage provided no data.
    // getEarningsInsight already includes revenue via the financialData Yahoo module
    // so calling getFinancials (which defaults to Alpha Vantage) is not needed here
    // and would cause 40+ second hangs when Alpha Vantage is rate-limited.
    if (insight.history.length === 0) {
      try {
        const yahooInsight = await yahoo.getEarningsInsight(ticker);
        if (yahooInsight && Array.isArray(yahooInsight.history) && yahooInsight.history.length > 0) {
          insight = yahooInsight;
          if (isPreviewMode) dataError = null;
        }
      } catch {
        // Yahoo fallback failed — original dataError remains
      }
    }
  } else {
    financials = await mock.getCompanyFinancials(ticker);
  }

  return {
    ticker,
    profile,
    quote,
    financials,
    insight,
    cached: false,
    fetched_at: new Date().toISOString(),
    history_incomplete: historyIncomplete || undefined,
    available_quarters: availableQuarters || undefined,
    data_error: dataError || undefined,
  };
}

export async function getEarningsDetailData(
  ticker: string,
  historyLimit?: number
): Promise<EarningsDetailData> {
  const key = ticker.toUpperCase();

  const fresh = await fetchFreshEarningsDetail(key, historyLimit);
  return applyHistoryLimitToDetail(fresh, historyLimit);
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