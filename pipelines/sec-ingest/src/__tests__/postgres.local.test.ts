import { gunzipSync } from "node:zlib";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { blobRaw, containerFor } from "../blob";
import type { FactRow } from "../facts-rows";
import { runIngest } from "../ingest";
import { silentLogger } from "../log";
import { activeTickers, connect, postgresFacts, postgresState, type Db } from "../postgres";
import { createSecClient } from "../sec-client";
import type { RawStore } from "../stores";
import { FakeEdgar } from "./fake-edgar";
// @ts-expect-error: a plain .mjs tool with no types
import { alterRole, scramVerifier } from "../../local/scram-verifier.mjs";

/**
 * The Postgres and Blob writers against the local test bed
 * (pipelines/sec-ingest/local/docker-compose.yml): Postgres 15 with
 * migrations 011 and 012, PgBouncer in transaction mode in front of it,
 * Azurite. The pipeline connects through the pooler as huntr_sec_ingest,
 * so these tests also prove that the role's grants and the RLS policies
 * are enough, and nothing more than enough.
 *
 * Skipped unless SEC_INGEST_LOCAL=1 (`npm run test:local` sets it): they
 * need the containers running. They use postgres-test and pooler-test, so
 * they never touch what a manual run (`npm run local:run`) left behind.
 * Local credentials only; nothing here can reach Supabase or Azure.
 */
const LOCAL = process.env.SEC_INGEST_LOCAL === "1";
// The test stack, not the one manual runs use: these tests truncate freely.
const ADMIN_URL = "postgres://postgres:postgres@localhost:54339/postgres";
const PIPELINE_URL = "postgres://huntr_sec_ingest:local-only-not-a-secret@localhost:64339/postgres";
const AZURITE = "UseDevelopmentStorage=true";

const row = (over: Partial<FactRow>): FactRow => ({
  cik: 320193,
  conceptId: 3,
  unit: "USD",
  periodStart: null,
  periodEnd: "2026-06-27",
  value: 30e9,
  form: "10-Q",
  filed: "2026-08-01",
  accession: "0000320193-26-000010",
  ...over,
});

describe.skipIf(!LOCAL)("Postgres writer, as huntr_sec_ingest through the pooler", () => {
  let admin: ReturnType<typeof postgres>;
  let db: Db;

  beforeAll(() => {
    admin = postgres(ADMIN_URL, { onnotice: () => {} });
    db = connect({ url: PIPELINE_URL, tls: "disable" });
  });
  afterAll(async () => {
    await db.end({ timeout: 5 });
    await admin.end({ timeout: 5 });
  });
  beforeEach(async () => {
    await admin`truncate public.sec_company_facts, public.sec_ingest_state, public.sec_ingest_cursor, public.tickers`;
    await admin`insert into public.tickers (symbol, name, is_active) values ('AAPL', 'Apple', true), ('GOOG', 'Alphabet', true), ('GOOGL', 'Alphabet', true), ('OLD', 'Delisted', false)`;
  });

  it("connects as the pipeline's role, with no prepared statements", async () => {
    const [who] = await db<{ user: string }[]>`select current_user as user`;
    expect(who.user).toBe("huntr_sec_ingest");
  });

  it("reads the active tickers, and nothing else of the table", async () => {
    expect(await activeTickers(db)).toEqual(["AAPL", "GOOG", "GOOGL"]);
    await expect(db`select name from public.tickers`).rejects.toThrow(/permission denied/);
  });

  it("is refused everything its grants do not cover", async () => {
    await expect(db`update public.tickers set is_active = false`).rejects.toThrow(/permission denied/);
    await expect(db`insert into public.sec_concepts (id, taxonomy, name) values (99, 'dei', 'X')`).rejects.toThrow(/permission denied/);
    await expect(db`delete from public.sec_ingest_state`).rejects.toThrow(/permission denied/);
    await expect(db`create table public.intruder (id int)`).rejects.toThrow(/permission denied/);
  });

  it("keeps the cursor", async () => {
    const state = postgresState(db);
    expect(await state.getCursor()).toBeNull();
    await state.setCursor("2026-09-15", "2026-09-16T06:00:00.000Z");
    await state.setCursor("2026-09-18", "2026-09-21T06:00:00.000Z");
    expect(await state.getCursor()).toBe("2026-09-18");
    const [n] = await admin<{ n: number }[]>`select count(*)::int as n from public.sec_ingest_cursor`;
    expect(n.n).toBe(1);
  });

  it("round-trips a company's state, what it owes included", async () => {
    const state = postgresState(db);
    const s = {
      cik: 320193,
      ticker: "AAPL",
      lastAccession: "0000320193-26-000010",
      lastFiled: "2026-08-01",
      factsStored: 294,
      lastRunAt: "2026-09-21T06:00:00.000Z",
      lastError: null,
      pendingAccession: "0000320193-26-000030",
      pendingSince: "2026-09-21",
      pendingAttempts: 2,
    };
    await state.putCompany(s);
    await state.putCompany({ ...s, pendingAttempts: 3 });
    expect((await state.getCompanies()).get(320193)).toEqual({ ...s, pendingAttempts: 3 });
  });

  it("is held to migration 012's consistency check", async () => {
    const state = postgresState(db);
    await expect(
      state.putCompany({ cik: 1, ticker: "X", lastAccession: null, lastFiled: null, factsStored: 0, lastRunAt: "2026-09-21T06:00:00.000Z", lastError: null, pendingAccession: null, pendingSince: null, pendingAttempts: 1 })
    ).rejects.toThrow(/sec_ingest_state_pending_consistent/);
  });

  it("upserts by natural key: inserts, then leaves unchanged rows alone, then updates what changed", async () => {
    const facts = postgresFacts(db);
    const rows = [
      row({}), // an instant
      row({ accession: "0000320193-26-000020", form: "10-K", filed: "2026-10-30" }), // the same balance, as a comparative
      row({ conceptId: 26, periodStart: "2025-09-28", value: 300e9 }), // a flow
    ];
    expect(await facts.upsert(320193, rows)).toEqual({ inserted: 3, updated: 0, unchanged: 0 });
    expect(await facts.upsert(320193, rows)).toEqual({ inserted: 0, updated: 0, unchanged: 3 });
    expect(await facts.upsert(320193, [row({ value: 31e9 })])).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    const stored = await admin<{ n: number }[]>`select count(*)::int as n from public.sec_company_facts`;
    expect(stored[0].n).toBe(3);
  });

  it("makes two instants of one filing collide (NULLS NOT DISTINCT)", async () => {
    await postgresFacts(db).upsert(320193, [row({})]);
    await expect(admin`insert into public.sec_company_facts (cik, concept_id, unit, period_start, period_end, value, form, filed, accession)
      values (320193, 3, 'USD', null, '2026-06-27', 1, '10-Q', '2026-08-01', '0000320193-26-000010')`).rejects.toThrow(/sec_company_facts_natural_key/);
  });

  it("writes a large company in batches, in one transaction", async () => {
    const many = Array.from({ length: 2500 }, (_, i) => row({ accession: `0000320193-26-${String(100000 + i)}`, filed: "2026-08-01" }));
    expect(await postgresFacts(db).upsert(320193, many)).toEqual({ inserted: 2500, updated: 0, unchanged: 0 });
  });

  it("prunes periods older than the window", async () => {
    const facts = postgresFacts(db);
    await facts.upsert(320193, [row({ periodEnd: "2023-06-30", accession: "0000320193-23-000077" }), row({})]);
    expect(await facts.prune("2023-09-30")).toBe(1);
  });

  it("runs a full night end to end, twice, and the second run changes nothing", async () => {
    const edgar = new FakeEdgar();
    const written = new Map<string, Buffer>();
    const raw: RawStore = { put: async (k, b) => (written.has(k) ? "exists" : (written.set(k, b), "written")) };
    const run = () =>
      runIngest(
        { client: createSecClient({ fetch: edgar.fetch, sleep: async () => {} }), state: postgresState(db), facts: postgresFacts(db), raw, log: silentLogger },
        { tickers: ["AAPL", "GOOG", "GOOGL"], today: "2026-09-16", now: () => new Date("2026-09-16T06:00:00Z") }
      );
    const first = await run();
    expect(first).toMatchObject({ mode: "full", cursorAfter: "2026-09-15", alerts: [] });
    expect(first.rows).toMatchObject({ inserted: 2 });
    const second = await run();
    expect(second).toMatchObject({ mode: "incremental", cursorAfter: "2026-09-15" });
    expect(second.companies.targeted).toBe(0);
    const [n] = await admin<{ n: number }[]>`select count(*)::int as n from public.sec_ingest_state`;
    expect(n.n).toBe(2);
  });
});

describe.skipIf(!LOCAL)("the SCRAM verifier tool, against Postgres", () => {
  it("sets a password Postgres accepts on login, and refuses any other", async () => {
    const admin = postgres(ADMIN_URL, { onnotice: () => {} });
    const password = "Zq7!vR2#pL9@xW4$mN6^tB8&";
    try {
      await admin`drop role if exists scram_tool_check`;
      await admin`create role scram_tool_check login`;
      await admin.unsafe(alterRole("scram_tool_check", scramVerifier(password)));
      const [stored] = await admin<{ p: string }[]>`select rolpassword as p from pg_authid where rolname = 'scram_tool_check'`;
      expect(stored.p).toMatch(/^SCRAM-SHA-256\$4096:/);

      const login = (pw: string) => postgres(`postgres://scram_tool_check:${encodeURIComponent(pw)}@localhost:54339/postgres`, { max: 1, onnotice: () => {} });
      const good = login(password);
      expect((await good<{ u: string }[]>`select current_user as u`)[0].u).toBe("scram_tool_check");
      await good.end({ timeout: 5 });
      const bad = login(password + "x");
      await expect(bad`select 1`).rejects.toThrow(/password authentication failed/);
      await bad.end({ timeout: 5 });
    } finally {
      await admin`drop role if exists scram_tool_check`;
      await admin.end({ timeout: 5 });
    }
  });
});

describe.skipIf(!LOCAL)("Blob writer, against Azurite", () => {
  const container = containerFor({ connectionString: AZURITE, container: "sec-raw-test" });
  beforeAll(async () => {
    await container.deleteIfExists();
    await container.create();
  });
  afterAll(async () => {
    await container.deleteIfExists();
  });

  it("writes a payload once, gzipped, and reports it as existing after that", async () => {
    const store = blobRaw(container);
    const body = Buffer.from(JSON.stringify({ facts: { dei: {} } }));
    const gz = (await import("node:zlib")).gzipSync(body);
    const key = "sec/companyfacts/0000320193/0000320193-26-000010.json.gz";
    expect(await store.put(key, gz)).toBe("written");
    expect(await store.put(key, gz)).toBe("exists");
    const blob = container.getBlobClient(key);
    const props = await blob.getProperties();
    expect(props.contentType).toBe("application/json");
    expect(props.contentEncoding).toBe("gzip");
    expect(gunzipSync(await blob.downloadToBuffer()).toString()).toBe(body.toString());
  });
});
