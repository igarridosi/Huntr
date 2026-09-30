/**
 * EDGAR's daily index: which companies filed what, one file per business
 * day, under daily-index/{YYYY}/QTR{n}/form.{YYYYMMDD}.idx.
 *
 * Which days exist is read from the quarter's index.json listing rather
 * than by asking for each day. A day that is not listed but precedes the
 * last listed day had no filings (a weekend, a holiday). A day after the
 * last listed one may simply not be published yet - EDGAR publishes each
 * index around 10 pm New York time - so the cursor waits for it instead of
 * skipping it, which is how filings would otherwise be lost without a trace.
 */

import { REVIEWED_FORMS } from "../../../src/lib/sec/forms";

export const EDGAR_DAILY_INDEX = "https://www.sec.gov/Archives/edgar/daily-index";

/** "2026-09-15" → 3. */
export function quarterOf(isoDate: string): number {
  return Math.ceil(Number(isoDate.slice(5, 7)) / 3);
}

export function compact(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

export function iso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function quarterListingUrl(year: number, quarter: number): string {
  return `${EDGAR_DAILY_INDEX}/${year}/QTR${quarter}/index.json`;
}

export function formIndexUrl(isoDate: string): string {
  return `${EDGAR_DAILY_INDEX}/${isoDate.slice(0, 4)}/QTR${quarterOf(isoDate)}/form.${compact(isoDate)}.idx`;
}

/** The quarters (year, n) that a span of days touches, oldest first. */
export function quartersBetween(from: string, to: string): Array<{ year: number; quarter: number }> {
  const out: Array<{ year: number; quarter: number }> = [];
  let year = Number(from.slice(0, 4));
  let quarter = quarterOf(from);
  const endYear = Number(to.slice(0, 4));
  const endQuarter = quarterOf(to);
  while (year < endYear || (year === endYear && quarter <= endQuarter)) {
    out.push({ year, quarter });
    quarter++;
    if (quarter > 4) {
      quarter = 1;
      year++;
    }
  }
  return out;
}

/** The days a quarter's index.json lists a form index for, as ISO dates. */
export function parseQuarterListing(payload: unknown): string[] {
  const items = (payload as { directory?: { item?: Array<{ name?: string }> } })?.directory?.item ?? [];
  return items
    .map((item) => /^form\.(\d{8})\.idx$/.exec(item.name ?? "")?.[1])
    .filter((d): d is string => !!d)
    .map(iso)
    .sort();
}

export interface IndexFiling {
  form: string;
  company: string;
  cik: number;
  filed: string;
  accession: string;
}

/**
 * The rows of a form.{date}.idx file. Columns are separated by runs of two
 * or more spaces; a form type can hold a single space ("SC 13G/A"), a
 * company name can too, the rest cannot.
 */
export function parseFormIndex(text: string): IndexFiling[] {
  const out: IndexFiling[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\S(?:.*?\S)?)\s{2,}(.*?)\s{2,}(\d+)\s+(\d{8})\s+(edgar\/data\/\d+\/([\d-]+)\.txt)\s*$/.exec(line);
    if (!m) continue;
    out.push({ form: m[1], company: m[2], cik: Number(m[3]), filed: iso(m[4]), accession: m[6] });
  }
  return out;
}

const REVIEWED = new Set<string>(REVIEWED_FORMS);

/** Filings of reviewed forms by companies in the universe. */
export function relevantFilings(filings: IndexFiling[], universe: ReadonlySet<number>): IndexFiling[] {
  return filings.filter((f) => REVIEWED.has(f.form) && universe.has(f.cik));
}

export interface IndexPlan {
  /** Listed days after the cursor, up to today: the files to read. */
  days: string[];
  /** Where the cursor goes once those days are ingested; unchanged when nothing new is published. */
  nextCursor: string | null;
  /** The latest day EDGAR has published, whatever the cursor. */
  lastPublished: string | null;
}

/**
 * The days to read after `cursor`, given the days EDGAR lists. Unlisted
 * days up to the last listed one are days without filings and are passed
 * over; nothing past the last listed day is assumed.
 */
export function planDays(cursor: string | null, listed: string[], today: string): IndexPlan {
  const published = listed.filter((d) => d <= today).sort();
  const lastPublished = published.at(-1) ?? null;
  if (cursor === null) return { days: [], nextCursor: lastPublished, lastPublished };
  const days = published.filter((d) => d > cursor);
  return { days, nextCursor: days.at(-1) ?? cursor, lastPublished };
}

/** Today's date in New York, where EDGAR's days begin and end. */
export function todayInNewYork(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}
