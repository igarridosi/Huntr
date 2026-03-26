/**
 * Yahoo Finance → Huntr domain model mappers.
 *
 * These pure functions transform the deeply-nested structures from
 * yahoo-finance2's quoteSummary (profile/quote) and fundamentalsTimeSeries
 * (financials) into our flat, typed domain interfaces.
 * No side effects, no API calls — only data transformation.
 */

import type { StockProfile, StockQuote } from "@/types/stock";
import type {
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
  CompanyFinancials,
} from "@/types/financials";
import type {
  YahooQuoteSummaryResult,
  TimeSeriesFinancialsCache,
} from "@/types/yahoo";
import { buildTickerLogoUrl, normalizeWebsiteUrl } from "@/lib/logo";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

/** Safely coerce a nullable number to 0. */
function n(value: number | null | undefined): number {
  return value ?? 0;
}

/**
 * Format a Yahoo endDate into a fiscal period label.
 *  - Annual:    "FY2024"
 *  - Quarterly: "Q3 2024"
 */
function toPeriodLabel(endDate: Date, isAnnual: boolean): string {
  const d = new Date(endDate);
  const year = d.getUTCFullYear();
  if (isAnnual) return `FY${year}`;

  // Determine calendar quarter from month
  const month = d.getUTCMonth(); // 0-11
  const quarter = Math.ceil((month + 1) / 3);
  return `Q${quarter} ${year}`;
}

/** ISO date string from Yahoo date */
function toDateString(endDate: Date): string {
  return new Date(endDate).toISOString().split("T")[0];
}

function parseMaybeDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// Profile Mapper
// ─────────────────────────────────────────────────────────

/**
 * Map Yahoo quoteSummary (price + summaryProfile) → StockProfile.
 */
export function mapToStockProfile(
  ticker: string,
  data: YahooQuoteSummaryResult
): StockProfile {
  const price = data.price;
  const profile = data.summaryProfile;
  const website = profile?.website ?? null;

  return {
    ticker: ticker.toUpperCase(),
    name: price?.longName ?? price?.shortName ?? ticker.toUpperCase(),
    sector: profile?.sector ?? "Unknown",
    industry: profile?.industry ?? "Unknown",
    exchange: price?.exchangeName ?? price?.exchange ?? "Unknown",
    currency: price?.currency ?? "USD",
    country: profile?.country ?? "Unknown",
    description: profile?.longBusinessSummary ?? "",
    logo_url: buildTickerLogoUrl(website),
    website: normalizeWebsiteUrl(website),
  };
}

// ─────────────────────────────────────────────────────────
// Quote Mapper
// ─────────────────────────────────────────────────────────

/**
 * Map Yahoo quoteSummary (price + summaryDetail + defaultKeyStatistics) → StockQuote.
 */
export function mapToStockQuote(
  ticker: string,
  data: YahooQuoteSummaryResult
): StockQuote {
  const price = data.price;
  const detail = data.summaryDetail;
  const stats = data.defaultKeyStatistics;
  const financial = data.financialData;
  const earningsDates = data.calendarEvents?.earnings?.earningsDate ?? [];

  const previousClose =
    price?.regularMarketPreviousClose ??
    detail?.regularMarketPreviousClose ??
    detail?.previousClose ??
    0;

  const currentPrice = price?.regularMarketPrice ?? n(detail?.previousClose);
  const dayChange = currentPrice - previousClose;

  const rawPct =
    previousClose > 0
      ? dayChange / previousClose
      : (price?.regularMarketChangePercent ?? 0);
  const dayChangePercent = Math.abs(rawPct) > 1 ? rawPct / 100 : rawPct;

  const parsedEarnings = earningsDates
    .map((v) => parseMaybeDate(v))
    .filter((v): v is Date => v !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  const now = Date.now();
  const dividendDate = parseMaybeDate(data.calendarEvents?.dividends?.dividendDate);
  const exDividendDate = parseMaybeDate(detail?.exDividendDate);
  const nextEarnings =
    parsedEarnings.find((date) => date.getTime() >= now) ??
    parsedEarnings[parsedEarnings.length - 1] ??
    null;

  return {
    ticker: ticker.toUpperCase(),
    price: currentPrice,
    current_volume:
      (price?.regularMarketVolume as number | undefined) ??
      n(detail?.volume),
    dividend_rate: n(detail?.dividendRate),
    dividend_date: dividendDate ? dividendDate.toISOString().split("T")[0] : null,
    ex_dividend_date: exDividendDate ? exDividendDate.toISOString().split("T")[0] : null,
    payout_ratio: n(detail?.payoutRatio),
    five_year_avg_dividend_yield: n(detail?.fiveYearAvgDividendYield),
    revenue_growth: n(financial?.revenueGrowth),
    earnings_growth: n(financial?.earningsGrowth),
    day_change: dayChange,
    day_change_percent: dayChangePercent,
    next_earnings_date: nextEarnings
      ? nextEarnings.toISOString().split("T")[0]
      : null,
    market_cap: price?.marketCap ?? n(detail?.marketCap),
    shares_outstanding: n(stats?.sharesOutstanding),
    pe_ratio: n(detail?.trailingPE),
    dividend_yield: n(detail?.dividendYield),
    fifty_two_week_high: n(detail?.fiftyTwoWeekHigh),
    fifty_two_week_low: n(detail?.fiftyTwoWeekLow),
    avg_volume: n(detail?.averageVolume) > 0 ? n(detail?.averageVolume) : n(detail?.averageVolume10days),
    beta: n(detail?.beta),
  };
}

// ─────────────────────────────────────────────────────────
// fundamentalsTimeSeries Helpers
// ─────────────────────────────────────────────────────────

/**
 * Robustly parse a date from Yahoo fundamentalsTimeSeries.
 * The date field can be a Date object, Unix timestamp (seconds), or ISO string.
 */
function parseTimeSeriesDate(raw: unknown): Date {
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") {
    // Unix timestamps from Yahoo are in seconds; JS uses milliseconds
    return raw < 1e12 ? new Date(raw * 1000) : new Date(raw);
  }
  if (typeof raw === "string") return new Date(raw);
  return new Date(0);
}

/** Safely read a numeric field from a time series row. */
function tsn(row: Record<string, unknown>, field: string): number {
  const val = row[field];
  return typeof val === "number" ? val : 0;
}

/** Check if a row has at least one of the required sentinel fields. */
function isSubstantialRow(
  row: Record<string, unknown>,
  requiredField: string
): boolean {
  return row[requiredField] != null && typeof row[requiredField] === "number";
}

function isSubstantialIncomeRow(row: Record<string, unknown>): boolean {
  const candidateFields = [
    "totalRevenue",
    "operatingRevenue",
    "operatingIncome",
    "netIncome",
    "EBITDA",
    "interestExpense",
    "basicEPS",
    "dilutedEPS",
  ];

  return candidateFields.some((field) => {
    const value = row[field];
    return typeof value === "number" && Number.isFinite(value);
  });
}

// ─────────────────────────────────────────────────────────
// Income Statement — fundamentalsTimeSeries mapper
// ─────────────────────────────────────────────────────────

function mapTsIncomeRow(
  row: Record<string, unknown>,
  isAnnual: boolean
): IncomeStatement {
  const date = parseTimeSeriesDate(row.date);
  const totalRevenue = tsn(row, "totalRevenue") || tsn(row, "operatingRevenue");
  return {
    period: toPeriodLabel(date, isAnnual),
    date: toDateString(date),
    currency: "USD",
    revenue: totalRevenue,
    cost_of_revenue: tsn(row, "costOfRevenue"),
    gross_profit: tsn(row, "grossProfit"),
    operating_expenses: tsn(row, "operatingExpense"),
    operating_income: tsn(row, "operatingIncome"),
    interest_expense: tsn(row, "interestExpense"),
    pre_tax_income: tsn(row, "pretaxIncome"),
    income_tax: tsn(row, "taxProvision"),
    net_income: tsn(row, "netIncome"),
    eps_basic: tsn(row, "basicEPS"),
    eps_diluted: tsn(row, "dilutedEPS"),
    shares_outstanding_basic: tsn(row, "basicAverageShares"),
    shares_outstanding_diluted: tsn(row, "dilutedAverageShares"),
    ebitda: tsn(row, "EBITDA"),
  };
}

// ─────────────────────────────────────────────────────────
// Balance Sheet — fundamentalsTimeSeries mapper
// ─────────────────────────────────────────────────────────

function mapTsBalanceRow(
  row: Record<string, unknown>,
  isAnnual: boolean
): BalanceSheet {
  const date = parseTimeSeriesDate(row.date);
  const cash = tsn(row, "cashAndCashEquivalents");
  const cashAndStInv = tsn(row, "cashCashEquivalentsAndShortTermInvestments");

  return {
    period: toPeriodLabel(date, isAnnual),
    date: toDateString(date),
    currency: "USD",
    cash_and_equivalents: cash,
    short_term_investments: Math.max(cashAndStInv - cash, 0),
    total_current_assets: tsn(row, "currentAssets"),
    total_non_current_assets: tsn(row, "totalNonCurrentAssets"),
    total_assets: tsn(row, "totalAssets"),
    total_current_liabilities: tsn(row, "currentLiabilities"),
    long_term_debt: tsn(row, "longTermDebt"),
    total_non_current_liabilities: tsn(
      row,
      "totalNonCurrentLiabilitiesNetMinorityInterest"
    ),
    total_liabilities: tsn(row, "totalLiabilitiesNetMinorityInterest"),
    total_equity: tsn(row, "stockholdersEquity"),
    retained_earnings: tsn(row, "retainedEarnings"),
    shares_outstanding: tsn(row, "ordinarySharesNumber"),
  };
}

// ─────────────────────────────────────────────────────────
// Cash Flow Statement — fundamentalsTimeSeries mapper
// ─────────────────────────────────────────────────────────

function mapTsCashFlowRow(
  row: Record<string, unknown>,
  isAnnual: boolean
): CashFlowStatement {
  const date = parseTimeSeriesDate(row.date);
  return {
    period: toPeriodLabel(date, isAnnual),
    date: toDateString(date),
    currency: "USD",
    operating_cash_flow: tsn(row, "operatingCashFlow"),
    capital_expenditures: tsn(row, "capitalExpenditure"),
    free_cash_flow: tsn(row, "freeCashFlow"),
    dividends_paid: tsn(row, "cashDividendsPaid"),
    share_repurchases: tsn(row, "repurchaseOfCapitalStock"),
    net_investing: tsn(row, "investingCashFlow"),
    net_financing: tsn(row, "financingCashFlow"),
    net_change_in_cash: tsn(row, "changesInCash"),
  };
}

// ─────────────────────────────────────────────────────────
// Full Financials — fundamentalsTimeSeries mapper
// ─────────────────────────────────────────────────────────

/**
 * Filter rows that have the sentinel field, sort oldest-first, and map to domain type.
 */
function filterSortMap<T>(
  rows: Record<string, unknown>[],
  requiredField: string,
  mapper: (row: Record<string, unknown>, isAnnual: boolean) => T,
  isAnnual: boolean
): T[] {
  return rows
    .filter((row) => isSubstantialRow(row, requiredField))
    .sort((a, b) => {
      const da = parseTimeSeriesDate(a.date).getTime();
      const db = parseTimeSeriesDate(b.date).getTime();
      return da - db; // oldest first
    })
    .map((row) => mapper(row, isAnnual));
}

/**
 * Map fundamentalsTimeSeries data → CompanyFinancials domain type.
 * Replaces the deprecated quoteSummary-based mapToCompanyFinancials.
 */
export function mapTimeSeriesFinancials(
  ticker: string,
  data: TimeSeriesFinancialsCache
): CompanyFinancials {
  return {
    ticker: ticker.toUpperCase(),
    income_statement: {
      annual: data.income.annual
        .filter((row) => isSubstantialIncomeRow(row))
        .sort((a, b) => {
          const da = parseTimeSeriesDate(a.date).getTime();
          const db = parseTimeSeriesDate(b.date).getTime();
          return da - db;
        })
        .map((row) => mapTsIncomeRow(row, true)),
      quarterly: data.income.quarterly
        .filter((row) => isSubstantialIncomeRow(row))
        .sort((a, b) => {
          const da = parseTimeSeriesDate(a.date).getTime();
          const db = parseTimeSeriesDate(b.date).getTime();
          return da - db;
        })
        .map((row) => mapTsIncomeRow(row, false)),
    },
    balance_sheet: {
      annual: filterSortMap(
        data.balance.annual,
        "totalAssets",
        mapTsBalanceRow,
        true
      ),
      quarterly: filterSortMap(
        data.balance.quarterly,
        "totalAssets",
        mapTsBalanceRow,
        false
      ),
    },
    cash_flow: {
      annual: filterSortMap(
        data.cashflow.annual,
        "operatingCashFlow",
        mapTsCashFlowRow,
        true
      ),
      quarterly: filterSortMap(
        data.cashflow.quarterly,
        "operatingCashFlow",
        mapTsCashFlowRow,
        false
      ),
    },
  };
}
