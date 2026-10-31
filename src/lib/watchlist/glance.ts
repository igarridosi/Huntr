/**
 * The orders a watchlist can be read in on the Hunting Ground: what moved
 * today, the trend, what reports next, and what is cheapest against the
 * reader's buy price or its own year. Each one is a figure and a direction;
 * a company without the figure goes last, in the list's own order.
 */

export type GlanceSort =
  | "day-up"
  | "day-down"
  | "volume"
  | "month-up"
  | "month-down"
  | "ytd-up"
  | "ytd-down"
  | "earnings"
  | "closest"
  | "off-high";

/** The figures a company is ordered by; null where it has none. */
export interface GlanceFigures {
  /** Today's move, a fraction. */
  change: number | null;
  /** The last 30 days, a fraction. */
  month: number | null;
  /** The year so far, a fraction. */
  ytd: number | null;
  /** Today's volume over its average. */
  volume: number | null;
  /** Days until the next earnings report. */
  earningsDays: number | null;
  /** Price against the reader's fair value: below it is negative. */
  gap: number | null;
  /** Price against the 52-week high: at most 0. */
  offHigh: number | null;
}

export const GLANCE_SORTS: readonly GlanceSort[] = [
  "day-up",
  "day-down",
  "volume",
  "month-up",
  "month-down",
  "ytd-up",
  "ytd-down",
  "earnings",
  "closest",
  "off-high",
];

/** Which figure each order reads, and whether the largest comes first. */
export const GLANCE_ORDER: Record<GlanceSort, { figure: keyof GlanceFigures; largestFirst: boolean }> = {
  "day-up": { figure: "change", largestFirst: true },
  "day-down": { figure: "change", largestFirst: false },
  volume: { figure: "volume", largestFirst: true },
  "month-up": { figure: "month", largestFirst: true },
  "month-down": { figure: "month", largestFirst: false },
  "ytd-up": { figure: "ytd", largestFirst: true },
  "ytd-down": { figure: "ytd", largestFirst: false },
  earnings: { figure: "earningsDays", largestFirst: false },
  closest: { figure: "gap", largestFirst: false },
  "off-high": { figure: "offHigh", largestFirst: false },
};

export function sortGlance<T>(rows: readonly T[], sort: GlanceSort, figuresOf: (row: T) => GlanceFigures): T[] {
  const { figure, largestFirst } = GLANCE_ORDER[sort];
  const valueOf = (row: T) => {
    const v = figuresOf(row)[figure];
    return v != null && Number.isFinite(v) ? v : null;
  };
  return rows
    .map((row, index) => ({ row, index, value: valueOf(row) }))
    .sort((a, b) => {
      if (a.value == null || b.value == null) {
        if (a.value == null && b.value == null) return a.index - b.index;
        return a.value == null ? 1 : -1;
      }
      const d = largestFirst ? b.value - a.value : a.value - b.value;
      return d !== 0 ? d : a.index - b.index;
    })
    .map(({ row }) => row);
}

/** Today's volume over its average, where both are known. */
export function volumeRatio(current: number | null | undefined, average: number | null | undefined): number | null {
  return current && average && current > 0 && average > 0 ? current / average : null;
}

/** How far the price is below its 52-week high, never above it. */
export function offHigh(price: number | null, high: number | null | undefined): number | null {
  return price != null && price > 0 && high && high > 0 ? Math.min(0, price / high - 1) : null;
}
