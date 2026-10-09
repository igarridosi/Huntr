/**
 * SEC EDGAR — choosing a figure among the rows EDGAR files for a concept.
 * Pure: no network, no framework. Shared by the app and the pipeline.
 */

import { REVIEWED_FORMS } from "./forms";

/** One figure, with the paperwork behind it. */
export interface SECFact {
  value: number;
  /** e.g. "10-Q", "10-K". */
  form: string;
  /** ISO date the filing was accepted. */
  filed: string;
  /** ISO date the period ends - what the number actually describes. */
  periodEnd: string;
  /** Which XBRL tag this came from, since several may have been tried. */
  concept: string;
  /** Days the fact covers. Zero for a balance-sheet instant. */
  durationDays: number;
  /** Accession number of the filing the figure was read from, when the feed carried it. */
  accession?: string;
  /**
   * True when this figure is known to be missing a component - one half of a
   * two-part total that could not be paired. The value is still the best
   * available, but it understates, and the interface should say so rather than
   * present a partial sum as a total.
   */
  partial?: boolean;
  /**
   * True when this cash figure still contains restricted balances because the
   * issuer does not disclose the split. Restricted cash cannot be used to
   * repay debt, so netting it at full value overstates the equity value - and
   * the interface should say so rather than let the number pass as free cash.
   */
  includesRestricted?: boolean;
}


/** A raw fact row as EDGAR returns it. Fields we do not use are ignored. */
export interface RawSECFact {
  start?: string;
  end?: string;
  val?: number;
  form?: string;
  filed?: string;
  fp?: string;
  fy?: number;
  /** The filing's accession number, e.g. "0001136893-26-000050": the document the figure can be traced to. */
  accn?: string;
}

// ─────────────────────────────────────────────────────────
// Pure helpers — the parts worth testing on their own
// ─────────────────────────────────────────────────────────

/** Forms that carry a reviewed balance sheet. */
const ACCEPTED_FORMS: readonly string[] = REVIEWED_FORMS;

export function durationInDays(fact: RawSECFact): number {
  if (!fact.start || !fact.end) return 0;
  const start = new Date(fact.start).getTime();
  const end = new Date(fact.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / (24 * 60 * 60 * 1000));
}

export type FactPeriod = "any" | "quarterly" | "annual";

/**
 * How old a fact may be and still describe the company today.
 *
 * Companies abandon tags. Ford last filed LongTermDebtNoncurrent in 2021, and
 * without a cutoff that five-year-old 291M is returned as the current debt of
 * a company that carries over a hundred billion - a wrong number wearing a
 * filing date, which is worse than no number at all. Past this age the figure
 * is refused so the caller falls back to a source that is at least current.
 *
 * Set beyond a year so a lease balance or any other figure disclosed only in
 * the annual report still counts as current between 10-Ks.
 */
export const MAX_FACT_AGE_DAYS = 450;

/**
 * Picks the fact that describes the most recent period.
 *
 * Three things this has to get right, each of which produced a wrong number
 * on screen when it did not:
 *
 *  - Recency by period end, not filing date. An amendment covering an older
 *    quarter can be filed after a newer one; the balance sheet we want is the
 *    latest that exists, not the most recently submitted piece of paper.
 *  - Only reviewed forms. EDGAR carries 8-K exhibits and registration
 *    statements under the same concept, and those can be years old or scoped
 *    to a transaction rather than the company.
 *  - The right period length. A flow concept like diluted shares appears in a
 *    10-Q both as the quarter and as the year to date, under the same tag and
 *    the same end date. Taking whichever came first in the array is how a
 *    share count ends up ~5% away from the one the market cap implies.
 */
export function selectLatestFact(
  facts: RawSECFact[],
  period: FactPeriod = "any",
  concept: string = "unknown",
  now: Date = new Date()
): SECFact | null {
  const oldestAcceptable =
    now.getTime() - MAX_FACT_AGE_DAYS * 24 * 60 * 60 * 1000;

  const usable = facts.filter((fact) => {
    if (typeof fact.val !== "number" || !Number.isFinite(fact.val)) return false;
    if (typeof fact.end !== "string" || fact.end.length === 0) return false;
    // An unlabelled form is kept: some older filings omit it, and dropping
    // them would lose companies rather than bad data.
    if (fact.form && !ACCEPTED_FORMS.includes(fact.form)) return false;

    // A tag the company stopped using is not a current figure, whatever its
    // filing date says.
    const end = new Date(fact.end).getTime();
    if (Number.isFinite(end) && end < oldestAcceptable) return false;

    if (period === "any") return true;
    const days = durationInDays(fact);
    if (days === 0) return true;
    // 330, not 250. A 10-Q files a nine-month year-to-date figure that runs
    // 272 days, and a loose threshold lets it through - where it then wins on
    // recency against the genuine full year in the last 10-K. That is how
    // Apple's stock compensation came out at 10.5B against a real annual
    // 12.9B, and Crocs' at 25M against 37M: a partial year presented as a
    // whole one, understating every adjustment built on it.
    return period === "quarterly" ? days <= 120 : days >= 330;
  });

  if (usable.length === 0) return null;

  const best = usable.reduce((winner, candidate) => {
    const byPeriod = (candidate.end ?? "").localeCompare(winner.end ?? "");
    if (byPeriod !== 0) return byPeriod > 0 ? candidate : winner;

    // Same period end: prefer the shorter window when we asked for quarterly,
    // so the year-to-date figure filed alongside it cannot win.
    if (period === "quarterly") {
      const byLength = durationInDays(candidate) - durationInDays(winner);
      if (byLength !== 0) return byLength < 0 ? candidate : winner;
    }

    return (candidate.filed ?? "").localeCompare(winner.filed ?? "") > 0
      ? candidate
      : winner;
  });

  return {
    value: best.val as number,
    form: best.form ?? "unknown",
    filed: best.filed ?? (best.end as string),
    periodEnd: best.end as string,
    concept,
    durationDays: durationInDays(best),
    ...(best.accn ? { accession: best.accn } : {}),
  };
}

/**
 * The largest flow filed for a period ending inside a recent window.
 *
 * For a deal the latest fact is the wrong one: the year-to-date of the fiscal
 * year after it reads zero. Synopsys paid $16.7B for Ansys in its 2025 fiscal
 * year; its 2026 year-to-date carries 0, so the perimeter was put down to a
 * $440M disposal and, without that, would have been called growth. Across a
 * window the largest figure is the year that holds the deal - the full year
 * where it is on file, which contains every year-to-date before it.
 */
export function selectLargestRecentFact(
  facts: RawSECFact[],
  windowDays: number,
  concept: string = "unknown",
  now: Date = new Date()
): SECFact | null {
  const oldestAcceptable = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const usable = facts.filter((fact) => {
    if (typeof fact.val !== "number" || !Number.isFinite(fact.val)) return false;
    if (typeof fact.end !== "string" || fact.end.length === 0) return false;
    if (fact.form && !ACCEPTED_FORMS.includes(fact.form)) return false;
    const end = new Date(fact.end).getTime();
    return Number.isFinite(end) && end >= oldestAcceptable;
  });
  if (usable.length === 0) return null;
  const best = usable.reduce((winner, candidate) => {
    const byValue = (candidate.val as number) - (winner.val as number);
    if (byValue !== 0) return byValue > 0 ? candidate : winner;
    return (candidate.end ?? "").localeCompare(winner.end ?? "") > 0 ? candidate : winner;
  });
  return {
    value: best.val as number,
    form: best.form ?? "unknown",
    filed: best.filed ?? (best.end as string),
    periodEnd: best.end as string,
    concept,
    durationDays: durationInDays(best),
    ...(best.accn ? { accession: best.accn } : {}),
  };
}

/**
 * Flattens EDGAR's units object into one list.
 *
 * A concept is filed under a unit key - "USD" for money, "shares" for counts -
 * and the caller does not care which, only that the numbers are comparable. We
 * take the unit with the most rows, which is always the primary one; a stray
 * secondary unit (a company reporting a handful of figures in EUR alongside
 * USD) would otherwise be able to win the recency contest with an unrelated
 * number.
 */
export function extractFactRows(payload: unknown): RawSECFact[] {
  const units = (payload as { units?: Record<string, unknown> })?.units;
  if (!units || typeof units !== "object") return [];

  let best: RawSECFact[] = [];
  for (const rows of Object.values(units)) {
    if (Array.isArray(rows) && rows.length > best.length) {
      best = rows as RawSECFact[];
    }
  }
  return best;
}

/**
 * How stale a figure is, in days, against a reference date.
 *
 * A quarterly filing is roughly 90 days old by the time the next one lands, so
 * anything past that is either an annual figure being used as a current one or
 * a company that has gone quiet. Either is worth flagging in amber.
 */
export function factAgeInDays(fact: SECFact, now: Date = new Date()): number {
  const filed = new Date(fact.filed).getTime();
  if (!Number.isFinite(filed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - filed) / (24 * 60 * 60 * 1000));
}

export const STALE_FACT_DAYS = 90;

/** Of two candidates for the same figure, the one describing a later period. */
export function pickFresher(
  a: SECFact | null,
  b: SECFact | null
): SECFact | null {
  if (!a) return b;
  if (!b) return a;
  return b.periodEnd.localeCompare(a.periodEnd) > 0 ? b : a;
}

/**
 * Adds two facts that make up one figure - the current and non-current halves
 * of debt, or of lease liabilities.
 *
 * The provenance kept is the older of the two, because that is how stale the
 * combined number really is. Reporting the fresher date would overstate how
 * current the total is.
 */
export function sumFacts(a: SECFact | null, b: SECFact | null): SECFact | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  const older = a.filed <= b.filed ? a : b;
  const accession = a.accession === b.accession ? a.accession : [a.accession, b.accession].filter(Boolean).join(" + ") || undefined;
  return {
    value: a.value + b.value,
    form: older.form,
    filed: older.filed,
    periodEnd: older.periodEnd,
    concept: `${a.concept} + ${b.concept}`,
    durationDays: older.durationDays,
    ...(accession ? { accession } : {}),
  };
}
