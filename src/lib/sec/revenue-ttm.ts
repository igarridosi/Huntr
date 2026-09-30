/**
 * SEC EDGAR — revenue, trailing twelve months, from the filings.
 */

import { durationInDays, selectLatestFact, type RawSECFact } from "./facts";

export interface SECRevenueTtm {
  value: number;
  periodStart: string;
  periodEnd: string;
  /** "10-K FY + 10-Q YTD − prior YTD" or "10-K FY" when no quarter has been filed since. */
  method: string;
  /** Every filing the figure was read from. */
  accessions: string[];
  concept: string;
}

const dayAfterIso = (iso: string) => new Date(Date.parse(iso) + 86_400_000).toISOString().slice(0, 10);
const daysApart = (a: string, b: string) => Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;

/**
 * The trailing twelve months of revenue as the filings carry it: the last
 * 10-K's year, plus the current year-to-date from the latest 10-Q, less
 * the same year-to-date a year earlier. A 10-K files only the year and a
 * 10-Q files the quarter and the year-to-date, so this is the one sum
 * that uses filed figures alone — no quarter is derived.
 */
export function composeRevenueTtm(rows: RawSECFact[], concept: string, now: Date = new Date()): SECRevenueTtm | null {
  const ok = rows.filter((r) => typeof r.val === "number" && Number.isFinite(r.val) && r.start && r.end);
  const annual = ok.filter((r) => durationInDays(r) >= 330 && (r.form ?? "10-K").startsWith("10-K"));
  const fy = selectLatestFact(annual, "annual", concept, now);
  if (!fy) return null;
  const fyRow = annual.filter((r) => r.end === fy.periodEnd).sort((a, b) => (b.filed ?? "").localeCompare(a.filed ?? ""))[0];
  const fyStart = fyRow.start as string;

  const ytd = ok.filter((r) => (r.form ?? "").startsWith("10-Q") && daysApart(r.start as string, dayAfterIso(fy.periodEnd)) <= 4 && (r.end as string) > fy.periodEnd);
  if (ytd.length === 0) {
    return { value: fy.value, periodStart: fyStart, periodEnd: fy.periodEnd, method: "10-K FY", accessions: [fy.accession].filter((a): a is string => !!a), concept };
  }
  const current = ytd.sort((a, b) => (b.end as string).localeCompare(a.end as string) || (b.filed ?? "").localeCompare(a.filed ?? ""))[0];
  const span = durationInDays(current);
  const prior = ok
    .filter((r) => Math.abs(durationInDays(r) - span) <= 10 && Math.abs(daysApart(r.end as string, current.end as string) - 365) <= 10)
    .sort((a, b) => (b.filed ?? "").localeCompare(a.filed ?? ""))[0];
  if (!prior) return null;
  return {
    value: fy.value + (current.val as number) - (prior.val as number),
    periodStart: dayAfterIso(prior.end as string),
    periodEnd: current.end as string,
    method: "10-K FY + 10-Q YTD − prior-year YTD",
    accessions: [...new Set([fy.accession, current.accn, prior.accn].filter((a): a is string => !!a))],
    concept,
  };
}
