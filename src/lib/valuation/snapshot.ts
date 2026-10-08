/**
 * The figures behind the ticker page's Valuation tab, as pure functions.
 *
 * The tab used to compute a "historical P/E" as today's price over each past
 * year's EPS. That is not a historical multiple: it divides a 2026 price by
 * 2023 earnings, so a company whose earnings grew tenfold showed a P/E history
 * of 400x to 1,300x, and the "fair value" built on it (NVDA: $2,074 against a
 * $237 price) was an artefact. Here every past multiple uses the price on the
 * day the fiscal year ended, taken from the daily closes.
 */

export interface DailyClose {
  date: string;
  close: number;
}

/** The last close on or before `date`, if one falls within `maxGapDays`. */
export function priceOn(history: DailyClose[], date: string, maxGapDays = 10): number | null {
  const target = new Date(date).getTime();
  if (!Number.isFinite(target)) return null;
  let best: DailyClose | null = null;
  for (const row of history) {
    const t = new Date(row.date).getTime();
    if (t <= target && (!best || t > new Date(best.date).getTime())) best = row;
  }
  if (!best || !(best.close > 0)) return null;
  const gapDays = (target - new Date(best.date).getTime()) / 86_400_000;
  return gapDays <= maxGapDays ? best.close : null;
}

export interface Spread {
  min: number;
  median: number;
  max: number;
  count: number;
}

export function spreadOf(values: number[]): Spread | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  const median = clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
  return { min: clean[0], median, max: clean[clean.length - 1], count: clean.length };
}

/** Where `value` sits between the spread's ends, 0 to 1 (clamped). */
export function positionIn(spread: Spread, value: number): number {
  const span = spread.max - spread.min;
  if (!(span > 0)) return 0.5;
  return Math.min(1, Math.max(0, (value - spread.min) / span));
}

/**
 * The growth in free cash flow the price implies: the constant annual rate
 * over `years` that, with a terminal value growing at `terminalGrowth` and
 * everything discounted at `discountRate`, makes the cash flows worth the
 * enterprise value. A deliberately small model (one input, fixed
 * assumptions, all shown to the reader); the DCF calculator has the full one.
 *
 * Null when free cash flow is not positive, or the price is out of reach
 * even at the ends of the search range.
 */
export function impliedFcfGrowth({
  fcf,
  enterpriseValue,
  discountRate = 0.09,
  terminalGrowth = 0.03,
  years = 10,
}: {
  fcf: number;
  enterpriseValue: number;
  discountRate?: number;
  terminalGrowth?: number;
  years?: number;
}): number | null {
  if (!(fcf > 0) || !(enterpriseValue > 0) || discountRate <= terminalGrowth) return null;

  const valueAt = (g: number) => {
    let total = 0;
    let flow = fcf;
    for (let t = 1; t <= years; t++) {
      flow *= 1 + g;
      total += flow / (1 + discountRate) ** t;
    }
    const terminal = (flow * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
    return total + terminal / (1 + discountRate) ** years;
  };

  let low = -0.3;
  let high = 0.8;
  if (enterpriseValue < valueAt(low) || enterpriseValue > valueAt(high)) return null;

  // Value rises with growth, so bisection on the bracket always converges.
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (valueAt(mid) < enterpriseValue) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Compound annual growth between the first and last of `values`, or null. */
export function cagrOf(values: number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (!(first > 0) || !(last > 0)) return null;
  return (last / first) ** (1 / (values.length - 1)) - 1;
}
