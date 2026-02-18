/**
 * Application-wide constants.
 */

// ---- Routes ----
export const ROUTES = {
  HOME: "/",
  APP: "/app",
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
  FINANCIALS: (ticker: string, type: "annual" | "quarterly") =>
    ["financials", ticker, type] as const,
  WATCHLIST: (userId: string) => ["watchlist", userId] as const,
  SEARCH: (query: string) => ["search", query] as const,
} as const;

// ---- Stale Times (ms) ----
export const STALE_TIMES = {
  STATIC: Infinity,
  QUOTE: 30_000,       // 30 seconds
  WATCHLIST: 60_000,   // 60 seconds
} as const;

// ---- Feature Flags ----
export const FEATURES = {
  ENABLE_AUTH: true,
  ENABLE_REAL_API: false,  // Toggle when migrating from mock to real API
} as const;
