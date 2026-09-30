/**
 * Where a run writes. The ingest logic knows only these interfaces; the
 * dry run puts them on disk, the real run on Postgres and Blob Storage.
 */

import type { FactRow } from "./facts-rows";

export interface CompanyState {
  cik: number;
  ticker: string;
  lastAccession: string | null;
  lastFiled: string | null;
  factsStored: number;
  lastRunAt: string;
  lastError: string | null;
  /** The filing still owed; null with a `pendingSince` when a full load is owed. */
  pendingAccession: string | null;
  /** The day (New York) it started being owed; null when nothing is. */
  pendingSince: string | null;
  pendingAttempts: number;
}

export interface StateStore {
  /** The last daily index fully processed, or null before the first full load. */
  getCursor(): Promise<string | null>;
  setCursor(date: string, at: string): Promise<void>;
  getCompanies(): Promise<Map<number, CompanyState>>;
  putCompany(state: CompanyState): Promise<void>;
}

export interface FactsSink {
  /** Insert or update by natural key. Rows already stored and not in `rows` are left alone. */
  upsert(cik: number, rows: FactRow[]): Promise<{ inserted: number; updated: number; unchanged: number }>;
  /** Delete rows whose period ended before `cutoff`. */
  prune(cutoff: string): Promise<number>;
}

export interface RawStore {
  /** Stores a gzipped payload under `key`; does nothing if it is already there. */
  put(key: string, gzipped: Buffer): Promise<"written" | "exists">;
}
