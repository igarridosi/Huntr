/**
 * portfolio-analytics
 * ───────────────────────────────────────────────────────────
 * Pure calculation helpers for portfolio risk/return analytics.
 *
 * Kept as a standalone module (no React, no Recharts) so it can be:
 *   • re-used across cards (risk metrics, drawdown chart, correlation)
 *   • unit-tested in isolation
 *   • imported from server actions in the future
 *
 * Conventions:
 *   - All percentages are returned as DECIMALS (0.123 = 12.3%)
 *   - Trading-day annualization assumes 252 days (US market standard)
 *   - Daily returns array uses simple returns: (P_t - P_{t-1}) / P_{t-1}
 */

const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE = 0.043; // 10Y Treasury proxy — see TODO below

// TODO: piping the real risk-free rate from an env/config would be nicer
// but a static 4.3% is fine for now and the formulas are unit-correct.

export interface DailyReturn {
  isoDate: string;
  /** Decimal daily return: 0.012 = +1.2% */
  ret: number;
}

export interface RiskMetrics {
  /** Annualized volatility (stdev * sqrt(252)) — decimal */
  volatility: number;
  /** Annualized return — decimal */
  annualReturn: number;
  /** Sharpe ratio (uses RISK_FREE_RATE) */
  sharpe: number;
  /** Sortino ratio — only downside deviation in denominator */
  sortino: number;
  /** Max drawdown over the window — decimal, always ≤ 0 */
  maxDrawdown: number;
  /** Beta vs benchmark (cov/var) */
  beta: number;
  /** Correlation with benchmark (-1 .. 1) */
  correlation: number;
  /** Number of return data points used */
  observations: number;
}

// ────────────────────────────────────────────────────────────
// Sequence → daily returns
// ────────────────────────────────────────────────────────────

export function buildDailyReturns(
  series: Array<{ date: string; close: number }>
): DailyReturn[] {
  if (!series || series.length < 2) return [];
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const out: DailyReturn[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].close;
    const curr = sorted[i].close;
    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(curr)) {
      out.push({ isoDate: sorted[i].date, ret: (curr - prev) / prev });
    }
  }
  return out;
}

/**
 * Reconstructs a daily portfolio value series from current positions and
 * a per-ticker close-price history. Uses *current* weights — adequate for
 * risk-metric backtest (constant-mix assumption) but NOT for true MWR/TWR.
 */
export function reconstructPortfolioValueSeries(
  positions: Array<{ ticker: string; shares: number }>,
  historyByTicker: Record<string, Array<{ date: string; close: number }>>
): Array<{ isoDate: string; value: number }> {
  if (positions.length === 0) return [];

  // Build a unified date axis from the intersection of all tickers that
  // have history. Use union and forward-fill instead of intersection so
  // we don't lose dates when one ticker has gaps.
  const closeMaps = new Map<string, Map<string, number>>();
  const dateSet = new Set<string>();
  for (const pos of positions) {
    const t = pos.ticker.toUpperCase();
    const rows = historyByTicker[t] ?? historyByTicker[pos.ticker] ?? [];
    if (rows.length < 2) continue;
    const m = new Map<string, number>();
    for (const r of rows) {
      if (Number.isFinite(r.close) && r.close > 0) {
        m.set(r.date, r.close);
        dateSet.add(r.date);
      }
    }
    if (m.size > 1) closeMaps.set(t, m);
  }
  if (dateSet.size < 2) return [];

  const dates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  const lastClose = new Map<string, number>();
  const out: Array<{ isoDate: string; value: number }> = [];

  for (const d of dates) {
    let value = 0;
    let priced = false;
    for (const pos of positions) {
      const t = pos.ticker.toUpperCase();
      const m = closeMaps.get(t);
      if (!m) continue;
      const c = m.get(d);
      if (typeof c === "number") lastClose.set(t, c);
      const eff = lastClose.get(t);
      if (typeof eff === "number") {
        value += pos.shares * eff;
        priced = true;
      }
    }
    if (priced) out.push({ isoDate: d, value });
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Statistical primitives
// ────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stdev(xs: number[], sample = true): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / (sample ? xs.length - 1 : xs.length));
}

function covariance(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (xs[i] - mx) * (ys[i] - my);
  return acc / (n - 1);
}

export function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const a = xs.slice(0, n);
  const b = ys.slice(0, n);
  const sa = stdev(a);
  const sb = stdev(b);
  if (sa === 0 || sb === 0) return 0;
  return covariance(a, b) / (sa * sb);
}

// ────────────────────────────────────────────────────────────
// Drawdown
// ────────────────────────────────────────────────────────────

export interface DrawdownPoint {
  isoDate: string;
  /** Drawdown decimal — always ≤ 0 (0 = at peak) */
  drawdown: number;
  /** Running peak value (for reference) */
  peak: number;
  /** Original value at this date */
  value: number;
}

export function computeDrawdownSeries(
  valueSeries: Array<{ isoDate: string; value: number }>
): DrawdownPoint[] {
  if (valueSeries.length === 0) return [];
  let peak = -Infinity;
  const out: DrawdownPoint[] = [];
  for (const p of valueSeries) {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? (p.value - peak) / peak : 0;
    out.push({ isoDate: p.isoDate, drawdown: dd, peak, value: p.value });
  }
  return out;
}

export function maxDrawdown(
  valueSeries: Array<{ isoDate: string; value: number }>
): number {
  const dd = computeDrawdownSeries(valueSeries);
  if (dd.length === 0) return 0;
  let min = 0;
  for (const p of dd) if (p.drawdown < min) min = p.drawdown;
  return min;
}

// ────────────────────────────────────────────────────────────
// Risk metrics (Sharpe, Sortino, Beta, etc.)
// ────────────────────────────────────────────────────────────

export function computeRiskMetrics(
  portfolioReturns: number[],
  benchmarkReturns: number[],
  valueSeries: Array<{ isoDate: string; value: number }>
): RiskMetrics {
  const n = portfolioReturns.length;
  if (n < 5) {
    return {
      volatility: 0,
      annualReturn: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      beta: 0,
      correlation: 0,
      observations: n,
    };
  }

  const meanRet = mean(portfolioReturns);
  const sd = stdev(portfolioReturns);
  const annualReturn = (1 + meanRet) ** TRADING_DAYS_PER_YEAR - 1;
  const annualVol = sd * Math.sqrt(TRADING_DAYS_PER_YEAR);

  const dailyRf = RISK_FREE_RATE / TRADING_DAYS_PER_YEAR;
  const excess = portfolioReturns.map((r) => r - dailyRf);
  const sharpe =
    sd > 0 ? (mean(excess) * TRADING_DAYS_PER_YEAR) / annualVol : 0;

  const downside = portfolioReturns.filter((r) => r < 0);
  const downsideDev =
    downside.length > 1
      ? Math.sqrt(
          downside.reduce((s, r) => s + r * r, 0) / (downside.length - 1)
        ) * Math.sqrt(TRADING_DAYS_PER_YEAR)
      : 0;
  const sortino =
    downsideDev > 0
      ? (annualReturn - RISK_FREE_RATE) / downsideDev
      : 0;

  // Align benchmark window to portfolio window
  const aligned = benchmarkReturns.slice(-n);
  const beta =
    aligned.length >= 2 && stdev(aligned) > 0
      ? covariance(portfolioReturns, aligned) / (stdev(aligned) ** 2)
      : 0;
  const correlation = pearsonCorrelation(portfolioReturns, aligned);

  return {
    volatility: annualVol,
    annualReturn,
    sharpe,
    sortino,
    maxDrawdown: maxDrawdown(valueSeries),
    beta,
    correlation,
    observations: n,
  };
}

// ────────────────────────────────────────────────────────────
// Correlation matrix between tickers
// ────────────────────────────────────────────────────────────

export interface CorrelationMatrix {
  tickers: string[];
  /** Square matrix, matrix[i][j] = corr(tickers[i], tickers[j]) */
  matrix: number[][];
}

export function computeCorrelationMatrix(
  tickers: string[],
  historyByTicker: Record<string, Array<{ date: string; close: number }>>
): CorrelationMatrix {
  // Build per-ticker daily returns keyed by date
  const returnsByTicker = new Map<string, Map<string, number>>();
  for (const t of tickers) {
    const rows = historyByTicker[t.toUpperCase()] ?? historyByTicker[t] ?? [];
    const daily = buildDailyReturns(rows);
    const m = new Map<string, number>();
    for (const d of daily) m.set(d.isoDate, d.ret);
    returnsByTicker.set(t, m);
  }

  const matrix: number[][] = [];
  for (let i = 0; i < tickers.length; i++) {
    matrix.push([]);
    const mi = returnsByTicker.get(tickers[i]);
    for (let j = 0; j < tickers.length; j++) {
      if (i === j) {
        matrix[i].push(1);
        continue;
      }
      const mj = returnsByTicker.get(tickers[j]);
      if (!mi || !mj || mi.size < 5 || mj.size < 5) {
        matrix[i].push(NaN);
        continue;
      }
      // Intersection of dates
      const xs: number[] = [];
      const ys: number[] = [];
      mi.forEach((v, k) => {
        const w = mj.get(k);
        if (typeof w === "number") {
          xs.push(v);
          ys.push(w);
        }
      });
      matrix[i].push(xs.length >= 5 ? pearsonCorrelation(xs, ys) : NaN);
    }
  }

  return { tickers, matrix };
}

export const ANALYTICS_CONSTANTS = {
  TRADING_DAYS_PER_YEAR,
  RISK_FREE_RATE,
};

// ────────────────────────────────────────────────────────────
// TWR (Time-Weighted Return) value series
// ────────────────────────────────────────────────────────────

export interface PortfolioTxInput {
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  executed_at: string; // ISO date or ISO datetime
}

export interface PortfolioPositionInput {
  ticker: string;
  shares: number;
  avg_cost: number;
  added_at: string; // ISO date or ISO datetime
}

/**
 * Builds a TWR (Time-Weighted Return) cumulative value series that matches
 * the Portfolio Evolution chart methodology.
 *
 * Uses actual transaction history (buy/sell events) to compute which shares
 * were held at each date. Cash flows (purchases / proceeds) are excluded from
 * the return so only price appreciation is measured — not capital injections.
 *
 * Output: `value` is the cumulative return FACTOR starting at 1.0 (0% return).
 *   - 1.12 → +12%
 *   - 0.85 → −15%
 *
 * This is the correct method when portfolio composition changes over time.
 * Constant-mix (shares × price) distorts returns when positions are added
 * at different dates because it back-projects current holdings historically.
 */
export function buildTWRValueSeries(
  positions: PortfolioPositionInput[],
  transactions: PortfolioTxInput[],
  historyByTicker: Record<string, Array<{ date: string; close: number }>>
): Array<{ isoDate: string; value: number }> {
  if (positions.length === 0) return [];

  const tickers = [
    ...new Set([
      ...positions.map((p) => p.ticker.toUpperCase()),
      ...transactions.map((tx) => tx.ticker.toUpperCase()),
    ]),
  ];

  // ── Build per-ticker close maps + union date axis ──────
  const closesByTicker = new Map<string, Map<string, number>>();
  const dateSet = new Set<string>();

  for (const ticker of tickers) {
    const rows =
      historyByTicker[ticker] ??
      historyByTicker[ticker.toLowerCase()] ??
      [];
    if (rows.length < 2) continue;
    const m = new Map<string, number>();
    for (const r of rows) {
      if (Number.isFinite(r.close) && r.close > 0) {
        m.set(r.date, r.close);
        dateSet.add(r.date);
      }
    }
    if (m.size > 1) closesByTicker.set(ticker, m);
  }

  if (dateSet.size < 2) return [];

  const orderedDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));

  // ── Build transaction event list ───────────────────────
  // Fall back to position-level events when no transaction history exists.
  const baseEvents: PortfolioTxInput[] =
    transactions.length > 0
      ? transactions
      : positions.map((p) => ({
          ticker: p.ticker,
          side: "buy" as const,
          shares: p.shares,
          price: p.avg_cost,
          executed_at: p.added_at,
        }));

  // Reconcile net shares from events with current live positions.
  // Adds a synthetic adjustment so the final day matches reality exactly.
  const netSharesByTicker = new Map<string, number>();
  for (const tx of baseEvents) {
    const t = tx.ticker.toUpperCase();
    netSharesByTicker.set(
      t,
      (netSharesByTicker.get(t) ?? 0) + (tx.side === "buy" ? tx.shares : -tx.shares)
    );
  }

  const allEvents: Array<{
    ticker: string;
    side: "buy" | "sell";
    shares: number;
    price: number;
    isoDate: string;
  }> = baseEvents.map((tx) => ({
    ticker: tx.ticker.toUpperCase(),
    side: tx.side,
    shares: tx.shares,
    price: tx.price,
    isoDate: tx.executed_at.slice(0, 10),
  }));

  for (const pos of positions) {
    const t = pos.ticker.toUpperCase();
    const diff = pos.shares - (netSharesByTicker.get(t) ?? 0);
    if (Math.abs(diff) > 1e-9) {
      allEvents.push({
        ticker: t,
        side: diff > 0 ? "buy" : "sell",
        shares: Math.abs(diff),
        price: pos.avg_cost,
        isoDate: pos.added_at.slice(0, 10),
      });
    }
  }

  // Sort: by date, buys before sells on same day
  allEvents.sort((a, b) => {
    const d = a.isoDate.localeCompare(b.isoDate);
    if (d !== 0) return d;
    return a.side === "buy" ? -1 : 1;
  });

  // ── TWR replay ─────────────────────────────────────────
  const liveSharesByTicker = new Map<string, number>();
  const lastCloseByTicker = new Map<string, number>();
  let txCursor = 0;
  let started = false;
  let previousValue = 0;
  let cumulative = 1;

  const out: Array<{ isoDate: string; value: number }> = [];

  for (const isoDate of orderedDates) {
    let flowValue = 0;

    // Apply all events on or before this date
    while (txCursor < allEvents.length && allEvents[txCursor].isoDate <= isoDate) {
      const tx = allEvents[txCursor];
      const { ticker } = tx;

      if (closesByTicker.has(ticker)) {
        const cur = liveSharesByTicker.get(ticker) ?? 0;
        if (tx.side === "buy") {
          liveSharesByTicker.set(ticker, cur + tx.shares);
          flowValue += tx.shares * tx.price;
        } else {
          const sell = Math.min(tx.shares, cur);
          if (sell > 0) {
            const next = cur - sell;
            if (next <= 1e-9) liveSharesByTicker.delete(ticker);
            else liveSharesByTicker.set(ticker, next);
            flowValue -= sell * tx.price;
          }
        }
      }
      txCursor++;
    }

    // Compute portfolio value using forward-filled prices
    let holdingsValue = 0;
    for (const [ticker, closeMap] of closesByTicker) {
      const close = closeMap.get(isoDate);
      if (typeof close === "number") lastCloseByTicker.set(ticker, close);
      const eff = lastCloseByTicker.get(ticker);
      if (typeof eff === "number") {
        holdingsValue += (liveSharesByTicker.get(ticker) ?? 0) * eff;
      }
    }

    // Start the series once the portfolio has value
    if (!started) {
      if (holdingsValue > 0) {
        started = true;
        previousValue = holdingsValue;
        out.push({ isoDate, value: 1.0 });
      }
      continue;
    }

    // TWR daily return (excludes cash flows / capital injections)
    if (previousValue > 1e-9) {
      const raw = (holdingsValue - previousValue - flowValue) / previousValue;
      cumulative *= 1 + (Number.isFinite(raw) ? raw : 0);
    }
    previousValue = holdingsValue;
    out.push({ isoDate, value: cumulative });
  }

  return out;
}
