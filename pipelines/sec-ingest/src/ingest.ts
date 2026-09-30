/**
 * One ingest run. Independent of where it runs (Azure Functions, GitHub
 * Actions, a laptop) and of where it writes (Postgres, disk): both are
 * passed in.
 *
 * First run (no cursor): every company in the universe is loaded in full.
 * Later runs: the daily indexes published since the cursor say which
 * companies filed a reviewed form; those, any company new to the universe
 * and any company that still owes something are fetched again.
 *
 * What a company owes is kept on the company, not on the run. A filing
 * that is in the index but not yet in companyfacts, or a download that
 * failed, is recorded against that company with the day it started and
 * the attempts so far, and retried every night. The cursor moves on
 * regardless: one company's filing that never gets XBRL (a 10-K/A that
 * only adds exhibits) must not stop the other nine hundred from updating.
 * Past PENDING_GIVE_UP_DAYS the company is flagged and the run raises the
 * alarm.
 *
 * The cursor does not move when the run itself fails - EDGAR refuses us,
 * a listed daily index cannot be read - or when --max-companies cut it
 * short. Every write is an upsert by natural key, so repeating days is safe.
 */

import { gzipSync } from "node:zlib";
import {
  addDays,
  daysBetween,
  formIndexUrl,
  parseFormIndex,
  parseQuarterListing,
  planDays,
  quarterListingUrl,
  quartersBetween,
  relevantFilings,
} from "./daily-index";
import { factRows, latestFiling, payloadHasAccession, windowStart } from "./facts-rows";
import type { Logger } from "./log";
import { SecBlockedError, type SecClient } from "./sec-client";
import type { CompanyState, FactsSink, RawStore, StateStore } from "./stores";
import { buildUniverse, cik10, SEC_TICKERS_URL, type Company } from "./universe";

export const SEC_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts";
export const WINDOW_YEARS = 3;
/** Past this many days without the cursor moving, the run raises the alarm. */
export const STALE_AFTER_DAYS = 4;
/**
 * How long a company may owe a filing before it is flagged. companyfacts
 * normally carries a filing within hours; five calendar days cover a long
 * weekend with a holiday in it and a slow EDGAR, and still flag within the
 * week.
 */
export const PENDING_GIVE_UP_DAYS = 5;
/** Failures in one run that point at the run rather than at the companies. */
const SYSTEMIC_FAILURES = { min: 5, share: 0.1 };
/** How far back the first run looks for the last published day. */
const FIRST_RUN_LOOKBACK_DAYS = 100;

/** A daily index the quarter listing announces but EDGAR does not serve. */
export class ListedIndexUnavailableError extends Error {
  constructor(
    readonly day: string,
    readonly status: number
  ) {
    super(`the daily index for ${day} is listed for its quarter but EDGAR answered ${status}`);
    this.name = "ListedIndexUnavailableError";
  }
}

export interface IngestDeps {
  client: SecClient;
  state: StateStore;
  facts: FactsSink;
  raw: RawStore;
  log: Logger;
}

export interface IngestOptions {
  /** The app's tickers. */
  tickers: string[];
  /** Today in New York, YYYY-MM-DD. */
  today: string;
  /** For trying the pipeline out: stop after this many companies. The cursor does not move. */
  maxCompanies?: number;
  now?: () => Date;
}

type Owed = { cik: number; ticker: string; accession: string | null; since: string; attempts: number };

export interface IngestSummary {
  mode: "full" | "incremental";
  today: string;
  cursorBefore: string | null;
  cursorAfter: string | null;
  lastPublished: string | null;
  daysRead: string[];
  filingsSeen: number;
  companies: {
    universe: number;
    unresolved: string[];
    targeted: number;
    ingested: number;
    withoutFacts: number;
    /** Filed per the daily index, not in companyfacts yet: retried next run. */
    pending: Owed[];
    /** Download or parse failed: retried next run. */
    failed: Array<Owed & { error: string }>;
    /** Owed for longer than PENDING_GIVE_UP_DAYS: flagged as errors. */
    overdue: Array<Owed & { reason: string }>;
  };
  rows: { kept: number; inserted: number; updated: number; unchanged: number; droppedForm: number; droppedWindow: number; droppedMalformed: number; pruned: number };
  raw: { written: number; existed: number; bytes: number };
  requests: number;
  partial: boolean;
  alerts: string[];
}

export async function runIngest(deps: IngestDeps, options: IngestOptions): Promise<IngestSummary> {
  const { client, state, facts, raw, log } = deps;
  const now = options.now ?? (() => new Date());
  const today = options.today;
  const cutoff = windowStart(today, WINDOW_YEARS);

  // ── Universe ────────────────────────────────────────────
  const secTickers = await client.json(SEC_TICKERS_URL);
  if (secTickers.kind !== "ok") throw new Error(`EDGAR's ticker file is missing (${secTickers.status})`);
  const universe = buildUniverse(options.tickers, secTickers.value);
  const ciks = new Set(universe.companies.map((c) => c.cik));
  log("info", "universe", { tickers: options.tickers.length, companies: universe.companies.length, unresolved: universe.unresolved.length, userAgent: client.userAgent });

  const cursorBefore = await state.getCursor();
  const known = await state.getCompanies();
  const mode = cursorBefore === null ? "full" : "incremental";

  // ── Which days ─────────────────────────────────────────
  const from = cursorBefore ?? addDays(today, -FIRST_RUN_LOOKBACK_DAYS);
  const listed: string[] = [];
  for (const { year, quarter } of quartersBetween(from, today)) {
    const listing = await client.json(quarterListingUrl(year, quarter));
    // A quarter that has not started publishing has no listing yet.
    if (listing.kind === "ok") listed.push(...parseQuarterListing(listing.value));
  }
  const plan = planDays(cursorBefore, listed, today);

  let filingsSeen = 0;
  const latestInIndex = new Map<number, { accession: string; filed: string }>();
  for (const day of plan.days) {
    const idx = await client.text(formIndexUrl(day));
    // Listed, so it exists: anything but the file is an error, not a quiet day.
    if (idx.kind !== "ok") throw new ListedIndexUnavailableError(day, idx.status);
    for (const f of relevantFilings(parseFormIndex(idx.value), ciks)) {
      filingsSeen++;
      const prev = latestInIndex.get(f.cik);
      if (!prev || f.filed > prev.filed || (f.filed === prev.filed && f.accession > prev.accession)) latestInIndex.set(f.cik, { accession: f.accession, filed: f.filed });
    }
  }

  // ── Which companies ────────────────────────────────────
  let targets: Company[] =
    mode === "full"
      ? universe.companies
      : universe.companies.filter((c) => {
          const s = known.get(c.cik);
          if (!s) return true; // new to the universe: load it in full
          if (s.pendingSince) return true; // still owes something
          const filed = latestInIndex.get(c.cik);
          return !!filed && filed.accession !== s.lastAccession;
        });
  log("info", "plan", { mode, cursor: cursorBefore, lastPublished: plan.lastPublished, days: plan.days, filingsSeen, targets: targets.length });

  const partial = options.maxCompanies !== undefined && targets.length > options.maxCompanies;
  if (partial) targets = targets.slice(0, options.maxCompanies);

  const summary: IngestSummary = {
    mode,
    today,
    cursorBefore,
    cursorAfter: cursorBefore,
    lastPublished: plan.lastPublished,
    daysRead: plan.days,
    filingsSeen,
    companies: { universe: universe.companies.length, unresolved: universe.unresolved, targeted: targets.length, ingested: 0, withoutFacts: 0, pending: [], failed: [], overdue: [] },
    rows: { kept: 0, inserted: 0, updated: 0, unchanged: 0, droppedForm: 0, droppedWindow: 0, droppedMalformed: 0, pruned: 0 },
    raw: { written: 0, existed: 0, bytes: 0 },
    requests: 0,
    partial,
    alerts: [],
  };

  // ── Fetch, store, upsert ───────────────────────────────
  for (const company of targets) {
    const started = Date.now();
    const prev = known.get(company.cik);
    // What this company owes: a filing the index announced, or one carried over.
    const owed = latestInIndex.get(company.cik) ?? (prev?.pendingAccession ? { accession: prev.pendingAccession, filed: null } : null);
    const settled = (s: Partial<CompanyState>): CompanyState => ({
      cik: company.cik,
      ticker: company.ticker,
      lastAccession: prev?.lastAccession ?? null,
      lastFiled: prev?.lastFiled ?? null,
      factsStored: prev?.factsStored ?? 0,
      lastRunAt: now().toISOString(),
      lastError: null,
      pendingAccession: null,
      pendingSince: null,
      pendingAttempts: 0,
      ...s,
    });
    /** Still owed after this attempt: since when, how many tries, and whether it is overdue. */
    const stillOwed = (accession: string | null) => {
      const since = prev?.pendingSince ?? today;
      const attempts = (prev?.pendingAttempts ?? 0) + 1;
      return { accession, since, attempts, overdue: daysBetween(since, today) > PENDING_GIVE_UP_DAYS };
    };

    try {
      const got = await client.bytes(`${SEC_FACTS_URL}/CIK${cik10(company.cik)}.json`);
      if (got.kind === "missing") {
        // No XBRL on file at all (some foreign issuers, funds): nothing to wait for.
        summary.companies.withoutFacts++;
        await state.putCompany(settled({ lastAccession: owed?.accession ?? prev?.lastAccession ?? null, lastFiled: owed?.filed ?? prev?.lastFiled ?? null, factsStored: 0 }));
        log("info", "company.no-facts", { cik: company.cik, ticker: company.ticker });
        continue;
      }

      const payload = JSON.parse(got.value.toString("utf8"));
      const { rows, dropped } = factRows(payload, company.cik, cutoff);
      const present = latestFiling(rows);

      // Whatever is there is stored, owed filing or not: it is current.
      const gz = gzipSync(got.value);
      const stored = await raw.put(`sec/companyfacts/${cik10(company.cik)}/${present?.accession ?? `none-${today}`}.json.gz`, gz);
      if (stored === "written") {
        summary.raw.written++;
        summary.raw.bytes += gz.length;
      } else summary.raw.existed++;
      const result = await facts.upsert(company.cik, rows);
      summary.rows.kept += rows.length;
      summary.rows.inserted += result.inserted;
      summary.rows.updated += result.updated;
      summary.rows.unchanged += result.unchanged;
      summary.rows.droppedForm += dropped.form;
      summary.rows.droppedWindow += dropped.window;
      summary.rows.droppedMalformed += dropped.malformed;

      if (owed && !payloadHasAccession(payload, owed.accession)) {
        const o = stillOwed(owed.accession);
        const entry = { cik: company.cik, ticker: company.ticker, accession: o.accession, since: o.since, attempts: o.attempts };
        if (o.overdue) {
          // Given up: it is not coming. Recorded as done so it stops being fetched, and flagged.
          const reason = `filing ${owed.accession} not in companyfacts after ${daysBetween(o.since, today)} days (${o.attempts} attempts)`;
          summary.companies.overdue.push({ ...entry, reason });
          await state.putCompany(settled({ lastAccession: owed.accession, lastFiled: owed.filed ?? prev?.lastFiled ?? null, factsStored: rows.length, lastError: reason }));
          log("error", "company.overdue", { ...entry, reason });
        } else {
          summary.companies.pending.push(entry);
          await state.putCompany(settled({ factsStored: rows.length, pendingAccession: o.accession, pendingSince: o.since, pendingAttempts: o.attempts }));
          log("warn", "company.pending", entry);
        }
        continue;
      }

      const latest = owed?.filed ? owed : (present ?? owed);
      await state.putCompany(settled({ lastAccession: latest?.accession ?? null, lastFiled: latest?.filed ?? null, factsStored: rows.length }));
      summary.companies.ingested++;
      log("info", "company.ingested", { cik: company.cik, ticker: company.ticker, rows: rows.length, ...result, accession: latest?.accession ?? null, rawBytes: gz.length, ms: Date.now() - started });
    } catch (error) {
      if (error instanceof SecBlockedError) throw error; // EDGAR refused us: stop everything
      const message = error instanceof Error ? error.message : String(error);
      // A failed first download owes a full load: no accession, just the date.
      const o = stillOwed(owed?.accession ?? prev?.pendingAccession ?? null);
      const entry = { cik: company.cik, ticker: company.ticker, accession: o.accession, since: o.since, attempts: o.attempts };
      summary.companies.failed.push({ ...entry, error: message });
      // Failures keep being retried; past the limit they are also flagged.
      if (o.overdue) summary.companies.overdue.push({ ...entry, reason: `failing for ${daysBetween(o.since, today)} days: ${message}` });
      await state.putCompany(settled({ lastError: message, pendingAccession: o.accession, pendingSince: o.since, pendingAttempts: o.attempts }));
      log("error", "company.failed", { ...entry, error: message });
    }
  }

  summary.rows.pruned = await facts.prune(cutoff);

  // ── Cursor and alarms ──────────────────────────────────
  if (!partial && plan.nextCursor && (!cursorBefore || plan.nextCursor > cursorBefore)) {
    await state.setCursor(plan.nextCursor, now().toISOString());
    summary.cursorAfter = plan.nextCursor;
  }
  if (partial) log("warn", "partial", { note: "--max-companies cut the run short; the cursor was not moved" });

  const { failed, overdue, pending } = summary.companies;
  if (overdue.length > 0) summary.alerts.push(`${overdue.length} companies overdue by more than ${PENDING_GIVE_UP_DAYS} days: ${overdue.map((o) => o.ticker).join(", ")}`);
  if (failed.length >= Math.max(SYSTEMIC_FAILURES.min, Math.ceil(targets.length * SYSTEMIC_FAILURES.share)))
    summary.alerts.push(`${failed.length} of ${targets.length} companies failed in this run`);
  if (plan.lastPublished === null) summary.alerts.push("no daily index is listed for the last quarters");
  const reference = summary.cursorAfter;
  if (reference && daysBetween(reference, today) > STALE_AFTER_DAYS) summary.alerts.push(`the cursor is ${daysBetween(reference, today)} days old (${reference})`);
  if (pending.length > 0 || failed.length > 0) log("warn", "owed", { pending: pending.length, failed: failed.length, note: "retried next run; flagged after " + PENDING_GIVE_UP_DAYS + " days" });

  summary.requests = client.requests;
  log(summary.alerts.length ? "error" : "info", "run.summary", { ...summary });
  return summary;
}
