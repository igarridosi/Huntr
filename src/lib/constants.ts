/**
 * Application-wide constants.
 */

// ---- Routes ----
export const ROUTES = {
  HOME: "/",
  APP: "/app",
  APP_INSIGHTS: "/app",
  APP_WATCHLISTS: "/app/watchlists",
  APP_EARNINGS: "/app/earnings",
  APP_TRANSCRIPTS: "/app/transcripts",
  APP_DCF_CALCULATOR: "/app/dcf-calculator",
  APP_PORTFOLIOS: "/app/portfolios",
  LOGIN: "/login",
  SIGNUP: "/signup",
  SYMBOL: (ticker: string) => `/symbol/${ticker}`,
  SYMBOL_FINANCIALS: (ticker: string) => `/symbol/${ticker}/financials`,
  SYMBOL_VALUATION: (ticker: string) => `/symbol/${ticker}/valuation`,
  SYMBOL_DIVIDENDS: (ticker: string) => `/symbol/${ticker}/dividends`,
} as const;

// ---- TanStack Query Keys ----
export const QUERY_KEYS = {
  STOCK_PROFILE: (ticker: string) => ["stock", "profile", ticker] as const,
  STOCK_QUOTE: (ticker: string) => ["stock", "quote", ticker] as const,
  STOCK_INTRADAY_TREND: (tickersKey: string) =>
    ["stock", "intraday-trend", tickersKey] as const,
  STOCK_PERFORMANCE: (window: "1D" | "1W" | "1M" | "YTD", tickersKey: string) =>
    ["stock", "performance", window, tickersKey] as const,
  STOCK_BUYBACK: (tickersKey: string) => ["stock", "buyback", tickersKey] as const,
  MARKET_INDICES: ["market", "indices"] as const,
  FINANCIALS: (ticker: string) => ["financials", ticker] as const,
  WATCHLIST: (userId: string) => ["watchlist", userId] as const,
  SEARCH: (query: string) => ["search", query] as const,
} as const;

// ---- Stale Times (ms) ----
export const STALE_TIMES = {
  STATIC: Infinity,
  QUOTE: 30_000,       // 30 seconds
  SEARCH: 15_000,      // 15 seconds
  INDICES: 10_000,     // 10 seconds
  WATCHLIST: 60_000,   // 60 seconds
} as const;

// ---- Feature Flags ----
export const FEATURES = {
  ENABLE_AUTH: true,
  ENABLE_REAL_API: true,  // Yahoo Finance + Supabase tickers (seeded)
} as const;
