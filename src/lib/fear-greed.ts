/**
 * Huntr's Fear & Greed index: how investors feel, from 0 (extreme fear) to
 * 100 (extreme greed), built from free daily prices. Not CNN's index, whose
 * data is not public; the same idea, with every input shown.
 *
 * Five signals, each a question about behaviour:
 *
 *   momentum     Is the S&P 500 above its 125-day average, and by how much?
 *   volatility   Is the VIX below its 50-day average (calm) or above (fear)?
 *   junk bonds   Are high-yield bonds (HYG) beating Treasuries (IEF) over
 *                20 days? Lenders reaching for yield is greed.
 *   safe haven   Are stocks (SPY) beating long bonds (TLT) over 20 days?
 *   breadth      Is the average stock (equal-weight RSP) keeping up with the
 *                giants (SPY) over 20 days? A rally carried by a few is fragile.
 *
 * Each signal is scored against its own past year: its percentile among the
 * last 252 trading days, 0 to 100. That makes signals on very different
 * scales comparable, and "greed" mean "greedier than usual this year". The
 * index is the average of the signals available that day.
 */

export type FearGreedComponent = "momentum" | "volatility" | "junk" | "safeHaven" | "breadth";

export const FEAR_GREED_COMPONENTS: ReadonlyArray<{ key: FearGreedComponent; label: string; question: string }> = [
  { key: "momentum", label: "Momentum", question: "S&P 500 against its 125-day average" },
  { key: "volatility", label: "Volatility", question: "VIX against its 50-day average" },
  { key: "junk", label: "Junk bonds", question: "High-yield bonds against Treasuries, 20 days" },
  { key: "safeHaven", label: "Safe havens", question: "Stocks against long bonds, 20 days" },
  { key: "breadth", label: "Breadth", question: "The average stock against the giants, 20 days" },
];

/** The daily closes the index is built from, by Yahoo symbol. */
export const FEAR_GREED_SYMBOLS = ["^GSPC", "^VIX", "HYG", "IEF", "SPY", "TLT", "RSP"] as const;
export type FearGreedSymbol = (typeof FEAR_GREED_SYMBOLS)[number];

export interface FearGreedPoint {
  /** ISO day. */
  date: string;
  value: number;
  components: Partial<Record<FearGreedComponent, number>>;
}

export type FearGreedZone = "extreme-fear" | "fear" | "neutral" | "greed" | "extreme-greed";

export const FEAR_GREED_ZONES: ReadonlyArray<{ zone: FearGreedZone; label: string; from: number; to: number }> = [
  { zone: "extreme-fear", label: "Extreme fear", from: 0, to: 25 },
  { zone: "fear", label: "Fear", from: 25, to: 45 },
  { zone: "neutral", label: "Neutral", from: 45, to: 55 },
  { zone: "greed", label: "Greed", from: 55, to: 75 },
  { zone: "extreme-greed", label: "Extreme greed", from: 75, to: 100.0001 },
];

export function zoneOf(value: number): (typeof FEAR_GREED_ZONES)[number] {
  return FEAR_GREED_ZONES.find((z) => value >= z.from && value < z.to) ?? FEAR_GREED_ZONES[2];
}

const WINDOW = 252;
const MOMENTUM_AVERAGE = 125;
const VIX_AVERAGE = 50;
const RETURN_DAYS = 20;

type Closes = Array<{ date: string; close: number }>;

/** Each symbol's close on each of the S&P 500's trading days, carried forward over a gap. */
function align(master: string[], series: Closes | undefined): Array<number | null> {
  const sorted = (series ?? []).filter((p) => p.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const out: Array<number | null> = [];
  let i = 0;
  let last: number | null = null;
  for (const date of master) {
    while (i < sorted.length && sorted[i].date <= date) last = sorted[i++].close;
    out.push(last);
  }
  return out;
}

function movingAverage(values: Array<number | null>, at: number, length: number): number | null {
  if (at + 1 < length) return null;
  let sum = 0;
  for (let i = at - length + 1; i <= at; i++) {
    const v = values[i];
    if (v == null) return null;
    sum += v;
  }
  return sum / length;
}

function pastReturn(values: Array<number | null>, at: number, days: number): number | null {
  const now = values[at];
  const then = at >= days ? values[at - days] : null;
  return now != null && then != null && then > 0 ? now / then - 1 : null;
}

/** Where `values[at]` falls among the last year of `values`, 0 to 100; null without half a year to compare. */
export function percentileAt(values: Array<number | null>, at: number, window = WINDOW): number | null {
  const current = values[at];
  if (current == null) return null;
  let below = 0;
  let equal = 0;
  let seen = 0;
  for (let i = Math.max(0, at - window + 1); i <= at; i++) {
    const v = values[i];
    if (v == null) continue;
    seen++;
    if (v < current) below++;
    else if (v === current) equal++;
  }
  if (seen < window / 2) return null;
  return ((below + (equal - 1) / 2) / Math.max(1, seen - 1)) * 100;
}

/** The index for every S&P 500 trading day that has at least three signals. */
export function computeFearGreed(history: Partial<Record<FearGreedSymbol, Closes>>): FearGreedPoint[] {
  const master = (history["^GSPC"] ?? [])
    .filter((p) => p.close > 0)
    .map((p) => p.date)
    .sort();
  if (master.length === 0) return [];

  const c = Object.fromEntries(FEAR_GREED_SYMBOLS.map((s) => [s, align(master, history[s])])) as Record<
    FearGreedSymbol,
    Array<number | null>
  >;

  const raw: Record<FearGreedComponent, Array<number | null>> = {
    momentum: master.map((_, t) => {
      const avg = movingAverage(c["^GSPC"], t, MOMENTUM_AVERAGE);
      const now = c["^GSPC"][t];
      return avg && now != null ? now / avg - 1 : null;
    }),
    // Inverted: a VIX above its average is fear.
    volatility: master.map((_, t) => {
      const avg = movingAverage(c["^VIX"], t, VIX_AVERAGE);
      const now = c["^VIX"][t];
      return avg && now != null ? -(now / avg - 1) : null;
    }),
    junk: master.map((_, t) => {
      const hy = pastReturn(c.HYG, t, RETURN_DAYS);
      const tsy = pastReturn(c.IEF, t, RETURN_DAYS);
      return hy != null && tsy != null ? hy - tsy : null;
    }),
    safeHaven: master.map((_, t) => {
      const stocks = pastReturn(c.SPY, t, RETURN_DAYS);
      const bonds = pastReturn(c.TLT, t, RETURN_DAYS);
      return stocks != null && bonds != null ? stocks - bonds : null;
    }),
    breadth: master.map((_, t) => {
      const equal = pastReturn(c.RSP, t, RETURN_DAYS);
      const cap = pastReturn(c.SPY, t, RETURN_DAYS);
      return equal != null && cap != null ? equal - cap : null;
    }),
  };

  const points: FearGreedPoint[] = [];
  master.forEach((date, t) => {
    const components: Partial<Record<FearGreedComponent, number>> = {};
    for (const { key } of FEAR_GREED_COMPONENTS) {
      const score = percentileAt(raw[key], t);
      if (score != null) components[key] = Math.round(score);
    }
    const scores = Object.values(components);
    if (scores.length < 3) return;
    points.push({ date, value: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), components });
  });
  return points;
}

export type FearGreedRange = "1W" | "1M" | "YTD";

/** The points of a range: the last 5 or 21 trading days, or the year so far. */
export function pointsIn(points: FearGreedPoint[], range: FearGreedRange): FearGreedPoint[] {
  if (range === "1W") return points.slice(-6);
  if (range === "1M") return points.slice(-22);
  const year = points.at(-1)?.date.slice(0, 4);
  return year ? points.filter((p) => p.date.startsWith(year)) : [];
}

/** The highest and lowest readings of a range, for the chart to name. */
export function extremesOf(points: FearGreedPoint[]): { high: FearGreedPoint; low: FearGreedPoint } | null {
  if (points.length === 0) return null;
  let high = points[0];
  let low = points[0];
  for (const p of points) {
    if (p.value > high.value) high = p;
    if (p.value < low.value) low = p;
  }
  return { high, low };
}
