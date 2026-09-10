/**
 * The company's realised FCF margin, and whether it is safe to compare against.
 *
 * The reverse DCF puts the market's implied assumption next to what the company
 * has actually managed, and that comparison is the most useful thing on the
 * page - when the history means anything. Several of the figures it produced
 * did not:
 *
 *  - AppLovin at 90.1%. No business turns 90 cents of every euro of revenue
 *    into free cash. It sold its Apps segment, revenue was restated as
 *    continuing operations, and the cash flow still carried the old base.
 *  - Visa at 61.5% against a real 47-55%.
 *  - Sezzle at 45.3%. A lender's operating cash flow moves with its loan book,
 *    not with its profitability.
 *  - Celsius at 20.3%, from a window that ends before the acquisitions that
 *    changed its cost structure.
 *  - Ollie's at 12.4% with capex at 3.8% of revenue and a 9.1% net margin,
 *    which does not add up.
 *
 * Two different failures are mixed in there. Some are arithmetic - a cash flow
 * paired with the wrong year's revenue. The rest are real numbers describing a
 * company that no longer exists in that form. This module computes the series
 * honestly and then says, per company, whether the band should be presented as
 * a benchmark at all.
 */

/** One fiscal year of realised margin. */
export interface MarginYear {
  /** The fiscal year label, e.g. "2025". */
  year: string;
  revenue: number;
  freeCashFlow: number;
  margin: number;
}

export type MarginHistoryFlag =
  | "revenue-discontinuity"
  | "margin-discontinuity"
  | "implausible-level"
  | "sector-mismatch"
  | "too-short";

export interface MarginHistory {
  /** Year by year, oldest first. Empty when nothing could be paired. */
  series: MarginYear[];
  median: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  /**
   * False when the band must not be presented as something the market can be
   * measured against.
   */
  comparable: boolean;
  flags: MarginHistoryFlag[];
  /** One sentence per flag, in the words the interface should use. */
  reasons: string[];
}

/** A one-year swing this large is a different company, not a bad year. */
export const MARGIN_DISCONTINUITY = 0.15;
/** A one-year revenue move this large is rarely organic. */
export const REVENUE_DISCONTINUITY = 0.2;
/**
 * Above this, free cash flow is almost certainly not what it appears to be.
 *
 * Deliberately generous: Visa really does earn about half its revenue as free
 * cash, and a handful of exchanges and software companies are not far behind.
 * The threshold is set to catch 90%, not to argue with 55%.
 */
export const IMPLAUSIBLE_MARGIN = 0.7;
/** Fewer years than this and there is no band, only a couple of points. */
export const MIN_YEARS = 3;

/**
 * Businesses whose operating cash flow is a balance-sheet movement.
 *
 * For a bank, an insurer or a consumer lender, cash from operations swings with
 * deposits, reserves and the loan book. It is a real number and it is not a
 * measure of profitability, so an FCF margin drawn from it says nothing about
 * the business - Sezzle's 45.3% is loan-book timing, not margin.
 */
const CASH_FLOW_UNSUITABLE = [
  "financial services",
  "financials",
  "banks",
  "banking",
  "insurance",
  "capital markets",
  "consumer finance",
  "mortgage",
  "credit services",
];

export function isCashFlowUnsuitableSector(sector?: string | null): boolean {
  if (!sector) return false;
  const needle = sector.trim().toLowerCase();
  return CASH_FLOW_UNSUITABLE.some((entry) => needle.includes(entry));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export interface MarginHistoryInput {
  /** Income statement rows: a date and the revenue for that period. */
  revenues: ReadonlyArray<{ date: string; revenue: number }>;
  /** Cash-flow rows: a date, operating cash flow and capital expenditure. */
  cashFlows: ReadonlyArray<{
    date: string;
    operating_cash_flow: number;
    capital_expenditures: number;
  }>;
  /** The company's sector, for the businesses where FCF is the wrong metric. */
  sector?: string | null;
  /** How many years to read, most recent first. */
  years?: number;
}

/**
 * Pairs the two statements **by fiscal year**, never by position.
 *
 * The two arrays do not always cover the same years - a company can file more
 * cash-flow history than income history, or one statement can be missing a
 * year - so lining them up by index quietly divides one year's cash flow by
 * another year's revenue. That is not a rounding error: it produces a margin
 * that belongs to no year at all, and it is the most likely source of the 90%
 * and 61% figures.
 */
export function buildMarginHistory(input: MarginHistoryInput): MarginHistory {
  const years = input.years ?? 5;

  const revenueByYear = new Map<string, number>();
  for (const row of input.revenues) {
    if (row.revenue > 0) revenueByYear.set(row.date.slice(0, 4), row.revenue);
  }

  const series: MarginYear[] = [];
  for (const row of input.cashFlows) {
    const year = row.date.slice(0, 4);
    const revenue = revenueByYear.get(year);
    if (revenue === undefined || !(revenue > 0)) continue;

    // Computed the way the model defines free cash flow, rather than read from
    // a precomputed field whose definition we do not control.
    const freeCashFlow =
      row.operating_cash_flow - Math.abs(row.capital_expenditures);
    if (!Number.isFinite(freeCashFlow)) continue;

    series.push({ year, revenue, freeCashFlow, margin: freeCashFlow / revenue });
  }

  series.sort((a, b) => a.year.localeCompare(b.year));
  const recent = series.slice(-years);

  const flags: MarginHistoryFlag[] = [];
  const reasons: string[] = [];

  if (isCashFlowUnsuitableSector(input.sector)) {
    flags.push("sector-mismatch");
    /*
     * Named as a sector rule, deliberately.
     *
     * It is categorical, not a measurement of this company, and it is blunt in
     * one direction: Visa is classified under financials and its cash flow is a
     * perfectly good measure of its profitability, so the band is suppressed
     * for a company where it would have been useful. That is the trade - the
     * alternative is presenting Sezzle's loan-book timing as a track record,
     * and a reader cannot tell those apart from the number alone. The years are
     * still shown below either way, so the judgement stays available.
     */
    reasons.push(
      `This company is classified under ${input.sector}. For a bank, insurer or lender, operating cash flow moves with the loan book and reserves rather than with profitability, so an FCF margin drawn from it measures the wrong thing. If that does not describe this business, read the years below directly.`
    );
  }

  if (recent.length < MIN_YEARS) {
    flags.push("too-short");
    reasons.push(
      `Only ${recent.length} year${recent.length === 1 ? "" : "s"} of paired revenue and cash flow, which is not enough to call a range.`
    );
  }

  const margins = recent.map((entry) => entry.margin);

  for (let index = 1; index < recent.length; index += 1) {
    const previous = recent[index - 1];
    const current = recent[index];

    if (Math.abs(current.margin - previous.margin) > MARGIN_DISCONTINUITY) {
      if (!flags.includes("margin-discontinuity")) {
        flags.push("margin-discontinuity");
        reasons.push(
          `The FCF margin moved from ${pct(previous.margin)} to ${pct(current.margin)} between ${previous.year} and ${current.year}. A step that size is usually a change in what is being measured — a disposal, an acquisition or a restatement — rather than a change in the business.`
        );
      }
    }

    const revenueChange =
      previous.revenue > 0
        ? Math.abs(current.revenue - previous.revenue) / previous.revenue
        : 0;
    if (revenueChange > REVENUE_DISCONTINUITY) {
      if (!flags.includes("revenue-discontinuity")) {
        flags.push("revenue-discontinuity");
        reasons.push(
          `Revenue moved ${pct(revenueChange)} between ${previous.year} and ${current.year}. If that came from a disposal or an acquisition rather than from trading, the years on either side are not describing the same company.`
        );
      }
    }
  }

  if (margins.some((margin) => margin > IMPLAUSIBLE_MARGIN)) {
    flags.push("implausible-level");
    reasons.push(
      `A free cash flow margin above ${pct(IMPLAUSIBLE_MARGIN)} is higher than any operating business sustains. The revenue and the cash flow are probably not describing the same set of operations.`
    );
  }

  return {
    series: recent,
    median: margins.length > 0 ? median(margins) : null,
    mean:
      margins.length > 0
        ? margins.reduce((sum, value) => sum + value, 0) / margins.length
        : null,
    min: margins.length > 0 ? Math.min(...margins) : null,
    max: margins.length > 0 ? Math.max(...margins) : null,
    comparable: flags.length === 0,
    flags,
    reasons,
  };
}
