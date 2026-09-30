import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, setupRun, type RunSetup } from "../config";
import { diskFacts, diskState } from "../disk";
import { IngestAlertError, runNightly, targetFor } from "../function";
import { silentLogger } from "../log";
import { createSecClient } from "../sec-client";
import type { RawStore } from "../stores";
import { FakeEdgar } from "./fake-edgar";

describe("targetFor", () => {
  it("blob-only: Blob for the raw payloads, the instance's disk for the rest, an explicit universe", () => {
    const t = targetFor({ SEC_INGEST_MODE: "blob-only", SEC_INGEST_TICKERS: "AAPL, GOOG,GOOGL" });
    expect(t).toMatchObject({ store: "disk", raw: "blob", tickers: ["AAPL", "GOOG", "GOOGL"] });
    expect(t.out).toBe(path.join(tmpdir(), "sec-ingest"));
  });

  it("real: Postgres and Blob, the universe from the database unless given", () => {
    expect(targetFor({ SEC_INGEST_MODE: "real" })).toMatchObject({ store: "postgres", raw: "blob", tickers: [] });
  });

  it("refuses a missing or unknown mode, and blob-only without tickers", () => {
    expect(() => targetFor({})).toThrow(ConfigError);
    expect(() => targetFor({ SEC_INGEST_MODE: "dry-run" })).toThrow(/must be "blob-only" or "real"/);
    expect(() => targetFor({ SEC_INGEST_MODE: "blob-only" })).toThrow(/SEC_INGEST_TICKERS/);
  });
});

describe("setupRun", () => {
  const base = { out: "unused", tickers: ["AAPL"] };

  it("requires a declared User-Agent for anything beyond the disk", async () => {
    await expect(setupRun({ ...base, store: "disk", raw: "blob" }, { SEC_RAW_BLOB_CONNECTION_STRING: "UseDevelopmentStorage=true" }, silentLogger)).rejects.toThrow(/SEC_USER_AGENT is required/);
    await expect(setupRun({ ...base, store: "postgres", raw: "disk" }, {}, silentLogger)).rejects.toThrow(/SEC_USER_AGENT is required/);
  });

  it("lets a disk-only run fall back to the default User-Agent, and says so", async () => {
    const lines: string[] = [];
    const setup = await setupRun({ ...base, store: "disk", raw: "disk" }, {}, (level, msg) => lines.push(`${level} ${msg}`));
    expect(setup.userAgent).toBe("Huntr huntrvalue.me contact@huntrvalue.me");
    expect(lines[0]).toBe("warn config");
    await setup.close();
  });

  it("needs a Blob target for raw payloads to Blob, and a database URL for Postgres", async () => {
    const ua = { SEC_USER_AGENT: "Test test@example.com" };
    await expect(setupRun({ ...base, store: "disk", raw: "blob" }, ua, silentLogger)).rejects.toThrow(/SEC_RAW_BLOB_ACCOUNT_URL/);
    await expect(setupRun({ ...base, store: "postgres", raw: "disk" }, ua, silentLogger)).rejects.toThrow(/SEC_INGEST_DATABASE_URL/);
  });

  it("needs tickers when there is no database to read them from", async () => {
    await expect(setupRun({ out: "unused", tickers: [], store: "disk", raw: "disk" }, {}, silentLogger)).rejects.toThrow(/no tickers/);
  });
});

describe("runNightly", () => {
  let out: string;
  let edgar: FakeEdgar;
  beforeEach(() => {
    out = mkdtempSync(path.join(tmpdir(), "sec-fn-"));
    edgar = new FakeEdgar();
  });
  afterEach(() => rmSync(out, { recursive: true, force: true }));

  const blobs = new Map<string, Buffer>();
  const fakeSetup: typeof setupRun = async (target): Promise<RunSetup> => {
    const raw: RawStore = { put: async (k, b) => (blobs.has(k) ? "exists" : (blobs.set(k, b), "written")) };
    return {
      deps: { client: createSecClient({ fetch: edgar.fetch, sleep: async () => {} }), state: diskState(out), facts: diskFacts(out), raw, log: silentLogger },
      tickers: target.tickers,
      userAgent: "Test test@example.com",
      close: async () => {},
    };
  };
  const env = { SEC_INGEST_MODE: "blob-only", SEC_INGEST_TICKERS: "AAPL,GOOG,GOOGL" };

  it("runs the ingest for New York's today and returns its summary", async () => {
    // 03:00 UTC on the 16th is still the 15th in New York.
    const summary = await runNightly(env, silentLogger, () => new Date("2026-09-16T03:00:00Z"), fakeSetup);
    expect(summary).toMatchObject({ today: "2026-09-15", mode: "full", cursorAfter: "2026-09-15", alerts: [] });
    expect(summary.companies.ingested).toBe(2);
  });

  it("fails the invocation when the run raises an alert, so the alert rule sees it", async () => {
    await runNightly(env, silentLogger, () => new Date("2026-09-16T12:00:00Z"), fakeSetup);
    const error = await runNightly(env, silentLogger, () => new Date("2026-09-24T12:00:00Z"), fakeSetup).catch((e) => e);
    expect(error).toBeInstanceOf(IngestAlertError);
    expect(error.message).toMatch(/the cursor is 9 days old/);
  });
});
