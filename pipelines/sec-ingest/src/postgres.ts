/**
 * The real run's state and facts, in Supabase Postgres.
 *
 * One connection per run, through the pooler in transaction mode, as the
 * role huntr_sec_ingest (migrations 011 and 012): that role can read two
 * columns of `tickers`, read `sec_concepts`, and write the three sec_ingest
 * tables, nothing else. Transaction mode hands the server connection back
 * after every transaction, so nothing may outlive one: no prepared
 * statements (`prepare: false`), no session settings, no advisory locks.
 */

import postgres, { type Sql } from "postgres";
import type { FactRow } from "./facts-rows";
import type { CompanyState, FactsSink, StateStore } from "./stores";

export type Db = Sql;

export interface ConnectOptions {
  /** postgres://huntr_sec_ingest.<project>:<password>@<pooler-host>:6543/postgres */
  url: string;
  /**
   * TLS. Verified by default, against the system's CAs or `ca` when given
   * (Supabase publishes the certificate of its own CA for verify-full).
   * "disable" is for the local test bed only.
   */
  tls?: { ca?: string } | "disable";
}

export function connect({ url, tls = {} }: ConnectOptions): Db {
  return postgres(url, {
    max: 1, // one connection per run
    prepare: false, // transaction pooling: no prepared statements
    ssl: tls === "disable" ? false : { rejectUnauthorized: true, ...(tls.ca ? { ca: tls.ca } : {}) },
    idle_timeout: 20,
    connect_timeout: 15,
    connection: { application_name: "huntr-sec-ingest" },
    onnotice: () => {},
  });
}

/** The app's active tickers: the universe to ingest. */
export async function activeTickers(sql: Db): Promise<string[]> {
  const rows = await sql<{ symbol: string }[]>`select symbol from public.tickers where is_active order by symbol`;
  return rows.map((r) => r.symbol);
}

/** Rows per statement: 9 parameters each, far under Postgres's 65,535. */
const BATCH = 1000;

export function postgresFacts(sql: Db): FactsSink {
  return {
    async upsert(cik, rows) {
      let inserted = 0;
      let updated = 0;
      // One transaction per company: its rows land together or not at all.
      await sql.begin(async (tx) => {
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const col = <K extends keyof FactRow>(k: K) => batch.map((r) => r[k]);
          // unnest keeps it to nine parameters whatever the batch size. The
          // conflict target is the NULLS NOT DISTINCT unique index, so two
          // instants (period_start NULL) of one filing collide as they must.
          // A row that has not changed is not rewritten (no dead tuple), and
          // RETURNING tells an insert (xmax = 0) from an update.
          const result = await tx<{ inserted: boolean }[]>`
            insert into public.sec_company_facts as f
              (cik, concept_id, unit, period_start, period_end, value, form, filed, accession)
            select * from unnest(
              ${col("cik") as number[]}::int[],
              ${col("conceptId") as number[]}::smallint[],
              ${col("unit") as string[]}::text[],
              ${col("periodStart") as (string | null)[]}::date[],
              ${col("periodEnd") as string[]}::date[],
              ${col("value").map(String)}::numeric[],
              ${col("form") as (string | null)[]}::text[],
              ${col("filed") as string[]}::date[],
              ${col("accession") as string[]}::text[]
            )
            on conflict (cik, concept_id, unit, period_end, period_start, accession) do update
              set value = excluded.value, form = excluded.form, filed = excluded.filed
              where (f.value, f.form, f.filed) is distinct from (excluded.value, excluded.form, excluded.filed)
            returning (xmax = 0) as inserted`;
          for (const r of result) {
            if (r.inserted) inserted++;
            else updated++;
          }
        }
      });
      return { inserted, updated, unchanged: rows.length - inserted - updated };
    },

    async prune(cutoff) {
      const result = await sql`delete from public.sec_company_facts where period_end < ${cutoff}::date`;
      return result.count;
    },
  };
}

interface StateRow {
  cik: number;
  ticker: string;
  last_accession: string | null;
  last_filed: string | null;
  facts_stored: number;
  last_run_at: Date;
  last_error: string | null;
  pending_accession: string | null;
  pending_since: string | null;
  pending_attempts: number;
}

export function postgresState(sql: Db): StateStore {
  return {
    async getCursor() {
      const rows = await sql<{ d: string }[]>`select last_index_date::text as d from public.sec_ingest_cursor where id`;
      return rows[0]?.d ?? null;
    },

    async setCursor(date, at) {
      await sql`
        insert into public.sec_ingest_cursor (id, last_index_date, last_success_at)
        values (true, ${date}::date, ${at}::timestamptz)
        on conflict (id) do update set last_index_date = excluded.last_index_date, last_success_at = excluded.last_success_at`;
    },

    async getCompanies() {
      const rows = await sql<StateRow[]>`
        select cik, ticker, last_accession, last_filed::text as last_filed, facts_stored, last_run_at,
               last_error, pending_accession, pending_since::text as pending_since, pending_attempts
        from public.sec_ingest_state`;
      return new Map(
        rows.map((r) => [
          r.cik,
          {
            cik: r.cik,
            ticker: r.ticker,
            lastAccession: r.last_accession,
            lastFiled: r.last_filed,
            factsStored: r.facts_stored,
            lastRunAt: new Date(r.last_run_at).toISOString(),
            lastError: r.last_error,
            pendingAccession: r.pending_accession,
            pendingSince: r.pending_since,
            pendingAttempts: r.pending_attempts,
          } satisfies CompanyState,
        ])
      );
    },

    async putCompany(s) {
      await sql`
        insert into public.sec_ingest_state
          (cik, ticker, last_accession, last_filed, facts_stored, last_run_at, last_error,
           pending_accession, pending_since, pending_attempts)
        values
          (${s.cik}, ${s.ticker}, ${s.lastAccession}, ${s.lastFiled}::date, ${s.factsStored}, ${s.lastRunAt}::timestamptz,
           ${s.lastError}, ${s.pendingAccession}, ${s.pendingSince}::date, ${s.pendingAttempts})
        on conflict (cik) do update set
          ticker = excluded.ticker,
          last_accession = excluded.last_accession,
          last_filed = excluded.last_filed,
          facts_stored = excluded.facts_stored,
          last_run_at = excluded.last_run_at,
          last_error = excluded.last_error,
          pending_accession = excluded.pending_accession,
          pending_since = excluded.pending_since,
          pending_attempts = excluded.pending_attempts`;
    },
  };
}
