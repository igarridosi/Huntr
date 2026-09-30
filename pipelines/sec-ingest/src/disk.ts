/**
 * The dry run's stores: everything the real run would write to Postgres
 * and Blob Storage goes to a folder instead, in files a person can open.
 *
 *   {out}/state.json                           cursor and per-company state (sec_ingest_cursor, sec_ingest_state)
 *   {out}/facts/{cik}.json                     the rows sec_company_facts would hold for that company
 *   {out}/raw/sec/companyfacts/{cik}/{accession}.json.gz   what Blob Storage would keep
 *
 * The facts files merge by natural key like the upsert does, so running
 * twice shows what a second night would change.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rowKey, type FactRow } from "./facts-rows";
import type { CompanyState, FactsSink, RawStore, StateStore } from "./stores";
import { cik10 } from "./universe";

interface StateFile {
  cursor: { lastIndexDate: string; lastSuccessAt: string } | null;
  companies: Record<string, CompanyState>;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

export function diskState(out: string): StateStore {
  const file = path.join(out, "state.json");
  const load = () => readJson<StateFile>(file, { cursor: null, companies: {} });
  return {
    async getCursor() {
      return (await load()).cursor?.lastIndexDate ?? null;
    },
    async setCursor(date, at) {
      const s = await load();
      s.cursor = { lastIndexDate: date, lastSuccessAt: at };
      await writeJson(file, s);
    },
    async getCompanies() {
      return new Map(Object.values((await load()).companies).map((c) => [c.cik, c]));
    },
    async putCompany(company) {
      const s = await load();
      s.companies[cik10(company.cik)] = company;
      await writeJson(file, s);
    },
  };
}

export function diskFacts(out: string): FactsSink {
  const dir = path.join(out, "facts");
  return {
    async upsert(cik, rows) {
      const file = path.join(dir, `${cik10(cik)}.json`);
      const stored = new Map((await readJson<FactRow[]>(file, [])).map((r) => [rowKey(r), r]));
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      for (const r of rows) {
        const prev = stored.get(rowKey(r));
        if (!prev) inserted++;
        else if (prev.value !== r.value || prev.form !== r.form || prev.filed !== r.filed) updated++;
        else unchanged++;
        stored.set(rowKey(r), r);
      }
      await writeJson(file, [...stored.values()]);
      return { inserted, updated, unchanged };
    },
    async prune(cutoff) {
      if (!existsSync(dir)) return 0;
      let removed = 0;
      for (const name of await readdir(dir)) {
        const file = path.join(dir, name);
        const rows = await readJson<FactRow[]>(file, []);
        const kept = rows.filter((r) => r.periodEnd >= cutoff);
        if (kept.length !== rows.length) {
          removed += rows.length - kept.length;
          await writeJson(file, kept);
        }
      }
      return removed;
    },
  };
}

export function diskRaw(out: string): RawStore {
  return {
    async put(key, gzipped) {
      const file = path.join(out, "raw", ...key.split("/"));
      if (existsSync(file)) return "exists";
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, gzipped);
      return "written";
    },
  };
}
