/**
 * Yahoo Finance raw response types.
 * These interfaces describe the shape of data returned by `yahoo-finance2`
 * via `quoteSummary()`. We only type the fields Huntr actually consumes.
 *
 * Source: yahoo-finance2 npm package — quoteSummary modules.
 * These are NOT our domain types; they are mapped to StockProfile,
 * StockQuote, and CompanyFinancials by the mapper layer.
 */

// ─────────────────────────────────────────────────────────
// Module: "price"
// ─────────────────────────────────────────────────────────

export interface YahooPrice {
  symbol: string;
  shortName: string | null;
  longName: string | null;
  currency: string;
  exchange: string;
  exchangeName: string;
  quoteType: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  marketCap: number;
}

// ─────────────────────────────────────────────────────────
// Module: "summaryProfile"
// ─────────────────────────────────────────────────────────

export interface YahooSummaryProfile {
  sector: string | null;
  industry: string | null;
  country: string | null;
  website: string | null;
  longBusinessSummary: string | null;
  fullTimeEmployees: number | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

// ─────────────────────────────────────────────────────────
// Module: "summaryDetail"
// ─────────────────────────────────────────────────────────

export interface YahooSummaryDetail {
  previousClose: number | null;
  open: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  regularMarketPreviousClose: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  exDividendDate: Date | null;
  payoutRatio: number | null;
  fiveYearAvgDividendYield: number | null;
  beta: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  volume: number | null;
  averageVolume: number | null;
  averageVolume10days: number | null;
  marketCap: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  currency: string | null;
}

// ─────────────────────────────────────────────────────────
// Module: "defaultKeyStatistics"
// ─────────────────────────────────────────────────────────

export interface YahooDefaultKeyStatistics {
  sharesOutstanding: number | null;
  floatShares: number | null;
  sharesShort: number | null;
  shortRatio: number | null;
  bookValue: number | null;
  priceToBook: number | null;
  earningsQuarterlyGrowth: number | null;
  trailingEps: number | null;
  forwardEps: number | null;
  pegRatio: number | null;
  enterpriseValue: number | null;
  enterpriseToRevenue: number | null;
  enterpriseToEbitda: number | null;
  profitMargins: number | null;
  "52WeekChange": number | null;
}

// ─────────────────────────────────────────────────────────
// Module: "financialData"
// ─────────────────────────────────────────────────────────

export interface YahooFinancialData {
  currentPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  targetMeanPrice: number | null;
  recommendationMean: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  totalRevenue: number | null;
  revenuePerShare: number | null;
  revenueGrowth: number | null;
  grossProfits: number | null;
  grossMargins: number | null;
  ebitdaMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  earningsGrowth: number | null;
  returnOnAssets: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
}

// ─────────────────────────────────────────────────────────
// Module: "calendarEvents"
// ─────────────────────────────────────────────────────────

export interface YahooCalendarEvents {
  earnings?: {
    earningsDate?: Array<Date | string | number>;
  };
}

// ─────────────────────────────────────────────────────────
// Financial Statement line items (shared shape for annual/quarterly)
// ─────────────────────────────────────────────────────────

/**
 * A single period from incomeStatementHistory or incomeStatementHistoryQuarterly.
 * Yahoo returns these as an array of objects with Date fields.
 */
export interface YahooIncomeStatementRow {
  endDate: Date;
  totalRevenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  totalOperatingExpenses: number | null;
  operatingIncome: number | null;
  interestExpense: number | null;
  incomeBeforeTax: number | null;
  incomeTaxExpense: number | null;
  netIncome: number | null;
  netIncomeApplicableToCommonShares: number | null;
  ebit: number | null;
  /** Yahoo sometimes returns this directly, sometimes absent */
  ebitda?: number | null;
  /** Diluted EPS — may come from earningsHistory instead */
  dilutedEPS?: number | null;
}

/**
 * A single period from balanceSheetHistory or balanceSheetHistoryQuarterly.
 */
export interface YahooBalanceSheetRow {
  endDate: Date;
  cash: number | null;
  shortTermInvestments: number | null;
  totalCurrentAssets: number | null;
  longTermInvestments: number | null;
  propertyPlantEquipment: number | null;
  totalAssets: number | null;
  totalCurrentLiabilities: number | null;
  longTermDebt: number | null;
  totalLiab: number | null;
  totalStockholderEquity: number | null;
  retainedEarnings: number | null;
  commonStock: number | null;
  otherCurrentAssets: number | null;
  otherAssets: number | null;
  otherCurrentLiab: number | null;
  otherLiab: number | null;
}

/**
 * A single period from cashflowStatementHistory or cashflowStatementHistoryQuarterly.
 */
export interface YahooCashFlowRow {
  endDate: Date;
  totalCashFromOperatingActivities: number | null;
  capitalExpenditures: number | null;
  totalCashflowsFromInvestingActivities: number | null;
  totalCashFromFinancingActivities: number | null;
  dividendsPaid: number | null;
  repurchaseOfStock: number | null;
  changeInCash: number | null;
  /** Yahoo sometimes calls it issuanceOfStock */
  issuanceOfStock?: number | null;
}

// ─────────────────────────────────────────────────────────
// Module: "earningsHistory" (for EPS data)
// ─────────────────────────────────────────────────────────

export interface YahooEarningsHistoryRow {
  quarter: Date;
  epsActual: number | null;
  epsEstimate: number | null;
  epsDifference: number | null;
  surprisePercent: number | null;
}

// ─────────────────────────────────────────────────────────
// Composite: Full quoteSummary response (only modules we use)
// ─────────────────────────────────────────────────────────

export interface YahooQuoteSummaryResult {
  price?: YahooPrice;
  summaryProfile?: YahooSummaryProfile;
  summaryDetail?: YahooSummaryDetail;
  defaultKeyStatistics?: YahooDefaultKeyStatistics;
  calendarEvents?: YahooCalendarEvents;
  financialData?: YahooFinancialData;
  incomeStatementHistory?: {
    incomeStatementHistory: YahooIncomeStatementRow[];
  };
  incomeStatementHistoryQuarterly?: {
    incomeStatementHistory: YahooIncomeStatementRow[];
  };
  balanceSheetHistory?: {
    balanceSheetStatements: YahooBalanceSheetRow[];
  };
  balanceSheetHistoryQuarterly?: {
    balanceSheetStatements: YahooBalanceSheetRow[];
  };
  cashflowStatementHistory?: {
    cashflowStatements: YahooCashFlowRow[];
  };
  cashflowStatementHistoryQuarterly?: {
    cashflowStatements: YahooCashFlowRow[];
  };
  earningsHistory?: {
    history: YahooEarningsHistoryRow[];
  };
}

// ─────────────────────────────────────────────────────────
// fundamentalsTimeSeries types
// (Replaces deprecated quoteSummary financial modules since Nov 2024)
// ─────────────────────────────────────────────────────────

/**
 * A single row returned by `yahooFinance.fundamentalsTimeSeries()`.
 * Fields are camelCase. `validateResult: false` is required.
 */
export interface FundamentalsTimeSeriesRow {
  date: Date | number | string;
  periodType?: string; // '12M' for annual, '3M' for quarterly
  [key: string]: unknown;
}

/**
 * Cached structure for financial time series data.
 * Stores raw fundamentalsTimeSeries rows grouped by module and period type.
 */
export interface TimeSeriesFinancialsCache {
  income: {
    annual: FundamentalsTimeSeriesRow[];
    quarterly: FundamentalsTimeSeriesRow[];
  };
  balance: {
    annual: FundamentalsTimeSeriesRow[];
    quarterly: FundamentalsTimeSeriesRow[];
  };
  cashflow: {
    annual: FundamentalsTimeSeriesRow[];
    quarterly: FundamentalsTimeSeriesRow[];
  };
}

// ─────────────────────────────────────────────────────────
// Ticker Seed types (for scripts/seed-tickers.ts)
// ─────────────────────────────────────────────────────────

export interface TickerSeedEntry {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  exchange: string;
}
