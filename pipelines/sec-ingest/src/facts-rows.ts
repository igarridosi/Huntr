/**
 * companyfacts → the rows of sec_company_facts.
 *
 * Kept exactly as EDGAR files them - every copy of a period, comparatives
 * included - because the app's selection reads the same rows in the same
 * shape. Filtered only on what the app would discard anyway: concepts it
 * does not read, forms that are not reviewed statements (a 10-KT or an 8-K
 * never reaches the insert), and periods that ended before the window.
 * Rows without a form are kept, as the app keeps them.
 */

import { SEC_CONCEPT_IDS } from "../../../src/lib/sec/concept-ids";
import { REVIEWED_FORMS } from "../../../src/lib/sec/forms";

export interface FactRow {
  cik: number;
  conceptId: number;
  unit: string;
  /** Null for an instant (a balance-sheet figure). */
  periodStart: string | null;
  periodEnd: string;
  value: number;
  form: string | null;
  filed: string;
  accession: string;
}

export interface RowsResult {
  rows: FactRow[];
  /** Rows dropped, by reason, so a run can say what it left out. */
  dropped: { form: number; window: number; malformed: number };
}

const REVIEWED = new Set<string>(REVIEWED_FORMS);
const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface RawRow {
  start?: string;
  end?: string;
  val?: number;
  form?: string;
  filed?: string;
  accn?: string;
}

export function factRows(payload: unknown, cik: number, cutoff: string): RowsResult {
  const facts = (payload as { facts?: Record<string, Record<string, { units?: Record<string, RawRow[]> }>> })?.facts ?? {};
  const rows: FactRow[] = [];
  const dropped = { form: 0, window: 0, malformed: 0 };

  for (const [conceptId, taxonomy, name] of SEC_CONCEPT_IDS) {
    const units = facts[taxonomy]?.[name]?.units;
    if (!units) continue;
    for (const [unit, list] of Object.entries(units)) {
      for (const r of list) {
        if (r.form && !REVIEWED.has(r.form)) {
          dropped.form++;
          continue;
        }
        if (
          typeof r.val !== "number" ||
          !Number.isFinite(r.val) ||
          !r.end ||
          !DATE.test(r.end) ||
          !r.filed ||
          !DATE.test(r.filed) ||
          !r.accn ||
          !ACCESSION.test(r.accn) ||
          (r.start !== undefined && (!DATE.test(r.start) || r.start > r.end))
        ) {
          dropped.malformed++;
          continue;
        }
        if (r.end < cutoff) {
          dropped.window++;
          continue;
        }
        rows.push({
          cik,
          conceptId,
          unit,
          periodStart: r.start ?? null,
          periodEnd: r.end,
          value: r.val,
          form: r.form ?? null,
          filed: r.filed,
          accession: r.accn,
        });
      }
    }
  }
  return { rows, dropped };
}

/** The natural key of a row, as the unique index has it (NULLS NOT DISTINCT). */
export function rowKey(r: FactRow): string {
  return [r.cik, r.conceptId, r.unit, r.periodEnd, r.periodStart ?? "", r.accession].join("|");
}

/** The latest filing among the rows: the one a rerun compares against. */
export function latestFiling(rows: FactRow[]): { accession: string; filed: string } | null {
  let best: FactRow | null = null;
  for (const r of rows) {
    if (!best || r.filed > best.filed || (r.filed === best.filed && r.accession > best.accession)) best = r;
  }
  return best ? { accession: best.accession, filed: best.filed } : null;
}

/** The first day of the window: periods ending before it are not stored. */
export function windowStart(today: string, years: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/**
 * Whether a filing has reached companyfacts yet, looking at every concept
 * rather than the 42 kept: an amendment that only restates Part III files
 * no financial figures but still carries its cover page under dei.
 */
export function payloadHasAccession(payload: unknown, accession: string): boolean {
  const facts = (payload as { facts?: Record<string, Record<string, { units?: Record<string, RawRow[]> }>> })?.facts ?? {};
  for (const taxonomy of Object.values(facts))
    for (const concept of Object.values(taxonomy))
      for (const list of Object.values(concept.units ?? {})) if (list.some((r) => r.accn === accession)) return true;
  return false;
}
