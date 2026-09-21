import type { CompanyFinancials, IncomeStatement } from "@/types/financials";

/**
 * The revenue the projection starts from, and where it comes from.
 *
 * The generator took the last closed fiscal year. Between a 10-K and the
 * next there are up to three 10-Qs, and for a company growing fast or
 * one that has bought or sold a business mid-year, the closed year is
 * not the company being valued: Celsius' 2025 ($2.5B) against the twelve
 * months to June 2026 ($3.0B) put the base 21% low, and every projected
 * flow with it. The trailing twelve months — the latest four quarters
 * the issuer has filed — is the default whenever at least one quarter
 * has been reported after the last fiscal year.
 */
export type RevenueBasis = "ttm" | "fiscal_year" | "manual";

export interface RevenueBaseOption {
  basis: Exclude<RevenueBasis, "manual">;
  value: number;
  /** First day covered (the day after the quarter before), ISO. */
  periodStart: string;
  /** The close of the last period covered, ISO. */
  periodEnd: string;
  /** "FY2025" or "Q3 2025 – Q2 2026": the periods summed, in the issuer's own labels. */
  periods: string;
}

export interface RevenueBases {
  ttm: RevenueBaseOption | null;
  fiscalYear: RevenueBaseOption | null;
  /** TTM whenever a quarter has closed after the last fiscal year and four consecutive ones are on file. */
  recommended: Exclude<RevenueBasis, "manual"> | null;
}

/** A quarter is this many days from the one before it, on any fiscal calendar (13-week quarters, a 53rd week now and then). */
const QUARTER_GAP_DAYS: [number, number] = [75, 105];
/** Past this, the closed year and the trailing twelve months describe different companies. */
export const REVENUE_BASE_DIVERGENCE = 0.1;

const sortAsc = <T extends { date: string }>(rows: readonly T[]) => [...rows].sort((a, b) => a.date.localeCompare(b.date));
const dayAfter = (iso: string) => new Date(Date.parse(iso) + 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Four consecutive quarters on the issuer's own calendar. Visa's quarters
 * close in December, March, June and September; Adobe's near the end of
 * February, May, August and November; each is read as filed, never as a
 * calendar quarter, so the sum is the fiscal twelve months either way.
 */
function trailingFour(quarters: IncomeStatement[]): { four: IncomeStatement[]; before: IncomeStatement | null } | null {
  const rows = sortAsc(quarters).filter((r) => r.revenue > 0);
  if (rows.length < 4) return null;
  const four = rows.slice(-4);
  for (let i = 1; i < 4; i++) {
    const gap = daysBetween(four[i - 1].date, four[i].date);
    if (gap < QUARTER_GAP_DAYS[0] || gap > QUARTER_GAP_DAYS[1]) return null;
  }
  return { four, before: rows.length >= 5 ? rows[rows.length - 5] : null };
}

export function revenueBases(fin: CompanyFinancials | null | undefined): RevenueBases {
  const annual = sortAsc(fin?.income_statement?.annual ?? []).filter((r) => r.revenue > 0);
  const lastYear = annual.at(-1);
  const fiscalYear: RevenueBaseOption | null = lastYear
    ? {
        basis: "fiscal_year",
        value: lastYear.revenue,
        periodStart: annual.length >= 2 ? dayAfter(annual[annual.length - 2].date) : lastYear.date.slice(0, 4) + "-01-01",
        periodEnd: lastYear.date,
        periods: lastYear.period || `FY${lastYear.date.slice(0, 4)}`,
      }
    : null;

  const trailing = trailingFour(fin?.income_statement?.quarterly ?? []);
  // Only when the quarters reach past the closed year: otherwise the sum is
  // the year itself, by another route.
  const ttm: RevenueBaseOption | null =
    trailing && (!lastYear || trailing.four[3].date > lastYear.date)
      ? {
          basis: "ttm",
          value: trailing.four.reduce((s, r) => s + r.revenue, 0),
          periodStart: trailing.before ? dayAfter(trailing.before.date) : startOfQuarter(trailing.four[0]),
          periodEnd: trailing.four[3].date,
          periods: `${trailing.four[0].period} – ${trailing.four[3].period}`,
        }
      : null;

  return { ttm, fiscalYear, recommended: ttm ? "ttm" : fiscalYear ? "fiscal_year" : null };
}

/** The first day of a quarter with nothing filed before it, taken as 90 days before its close: a label, not a ledger. */
function startOfQuarter(q: IncomeStatement): string {
  return new Date(Date.parse(q.date) - 90 * 86_400_000).toISOString().slice(0, 10);
}

export interface RevenueBaseDivergence {
  ttm: number;
  fiscalYear: number;
  /** ttm / fiscalYear − 1. */
  deviation: number;
  message: string;
}

/**
 * The two bases more than 10% apart. Two usual causes, named so the reader
 * checks the right thing: a business bought or sold part-way through the
 * year (Celsius closed Alani Nu in April 2025 and Rockstar in August
 * 2025; S&P Global spun Mobility off on 1 July 2026), or growth fast
 * enough that a closed year is short by definition.
 */
export function revenueBaseDivergence(bases: RevenueBases): RevenueBaseDivergence | null {
  if (!bases.ttm || !bases.fiscalYear || !(bases.fiscalYear.value > 0)) return null;
  const deviation = bases.ttm.value / bases.fiscalYear.value - 1;
  if (Math.abs(deviation) <= REVENUE_BASE_DIVERGENCE) return null;
  const m = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(0)}M`);
  const pct = `${(Math.abs(deviation) * 100).toFixed(1)}%`;
  const dir = deviation > 0 ? "above" : "below";
  return {
    ttm: bases.ttm.value,
    fiscalYear: bases.fiscalYear.value,
    deviation,
    message: `Revenue base: the trailing twelve months to ${bases.ttm.periodEnd} (${m(bases.ttm.value)}) sit ${pct} ${dir} the last closed fiscal year to ${bases.fiscalYear.periodEnd} (${m(bases.fiscalYear.value)}). Two usual causes — an acquisition or a spin-off part-way through the year, or growth fast enough that the closed year is short by definition — and each changes what "the company" means for the projection. Check which one this is before choosing the base.`,
  };
}

/** Which basis a stored revenue figure matches, for a scenario set loaded from the store. */
export function basisOf(value: number, bases: RevenueBases): RevenueBasis {
  const near = (o: RevenueBaseOption | null) => !!o && Math.abs(o.value - value) <= Math.max(1, o.value * 1e-6);
  if (near(bases.ttm)) return "ttm";
  if (near(bases.fiscalYear)) return "fiscal_year";
  return "manual";
}
