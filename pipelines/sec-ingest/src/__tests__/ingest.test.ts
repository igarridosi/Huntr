import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diskFacts, diskRaw, diskState } from "../disk";
import { owedFor, PENDING_GIVE_UP_DAYS, runIngest, type IngestSummary } from "../ingest";
import { silentLogger } from "../log";
import { createSecClient } from "../sec-client";
import { FakeEdgar } from "./fake-edgar";


let out: string;
let edgar: FakeEdgar;

beforeEach(() => {
  out = mkdtempSync(path.join(tmpdir(), "sec-ingest-"));
  edgar = new FakeEdgar();
});
afterEach(() => rmSync(out, { recursive: true, force: true }));

function run(today: string, tickers = ["AAPL", "GOOG", "GOOGL", "SPY"], maxCompanies?: number): Promise<IngestSummary> {
  return runIngest(
    {
      client: createSecClient({ fetch: edgar.fetch, sleep: async () => {} }),
      state: diskState(out),
      facts: diskFacts(out),
      raw: diskRaw(out),
      log: silentLogger,
    },
    { tickers, today, maxCompanies, now: () => new Date(`${today}T06:00:00Z`) }
  );
}

const state = () => JSON.parse(readFileSync(path.join(out, "state.json"), "utf8"));
const factsOf = (cik: string) => JSON.parse(readFileSync(path.join(out, "facts", `${cik}.json`), "utf8"));
const factUrls = () => edgar.urls.filter((u) => u.includes("companyfacts"));

describe("first run", () => {
  it("loads every company once, then points the cursor at the last published day", async () => {
    const s = await run("2026-09-16");
    expect(s.mode).toBe("full");
    expect(s.companies).toMatchObject({ universe: 2, unresolved: ["SPY"], targeted: 2, ingested: 2, failed: [], pending: [] });
    expect(factUrls()).toHaveLength(2); // GOOG and GOOGL: one download
    expect(s.cursorAfter).toBe("2026-09-15");
    expect(state().cursor.lastIndexDate).toBe("2026-09-15");
    expect(factsOf("0000320193")).toHaveLength(1);
    expect(s.raw.written).toBe(2);
    expect(s.alerts).toEqual([]);
  });

  it("moves the cursor even if a company fails, and owes that company a full load", async () => {
    edgar.failFacts.add(1652044);
    const s = await run("2026-09-16");
    expect(s.companies.failed).toMatchObject([{ ticker: "GOOG", accession: null, since: "2026-09-16", attempts: 1 }]);
    expect(s.cursorAfter).toBe("2026-09-15");
    expect(s.alerts).toEqual([]); // one failure is retried, not paged
    expect(state().companies["0001652044"]).toMatchObject({ pendingAccession: null, pendingSince: "2026-09-16", pendingAttempts: 1 });
    edgar.failFacts.clear();
    edgar.urls = [];
    const s2 = await run("2026-09-17");
    expect(factUrls()).toEqual(["https://data.sec.gov/api/xbrl/companyfacts/CIK0001652044.json"]);
    expect(s2.companies.ingested).toBe(1);
    expect(state().companies["0001652044"]).toMatchObject({ pendingSince: null, pendingAttempts: 0, lastError: null });
  });

  it("does not move the cursor when --max-companies cut the run short", async () => {
    const s = await run("2026-09-16", undefined, 1);
    expect(s.partial).toBe(true);
    expect(s.companies.ingested).toBe(1);
    expect(s.cursorAfter).toBeNull();
  });
});

describe("later runs", () => {
  beforeEach(async () => {
    await run("2026-09-16");
    edgar.urls = [];
  });

  it("does nothing when nothing new is published, and changes nothing if run again", async () => {
    const s = await run("2026-09-16");
    expect(s.mode).toBe("incremental");
    expect(s.daysRead).toEqual([]);
    expect(factUrls()).toEqual([]);
    expect(s.cursorAfter).toBe("2026-09-15");
  });

  it("fetches only the companies that filed, and moves the cursor over the weekend", async () => {
    edgar.file("2026-09-18", 320193, "0000320193-26-000030", 31e9);
    const s = await run("2026-09-21");
    expect(s.daysRead).toEqual(["2026-09-18"]);
    expect(factUrls()).toEqual(["https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json"]);
    expect(s.rows).toMatchObject({ inserted: 1, unchanged: 1 });
    expect(s.cursorAfter).toBe("2026-09-18");
    expect(state().companies["0000320193"].lastAccession).toBe("0000320193-26-000030");
  });

  it("is idempotent: the same days read twice leave the same rows", async () => {
    edgar.file("2026-09-18", 320193, "0000320193-26-000030", 31e9);
    await run("2026-09-21");
    const rows = factsOf("0000320193");
    // Force a rerun of the same day from a cursor rolled back by hand.
    const s0 = state();
    s0.cursor.lastIndexDate = "2026-09-15";
    s0.companies["0000320193"].lastAccession = "0000320193-26-000010";
    writeFileSync(path.join(out, "state.json"), JSON.stringify(s0));
    const s = await run("2026-09-21");
    expect(s.rows).toMatchObject({ inserted: 0, updated: 0, unchanged: 2 });
    expect(s.raw).toMatchObject({ written: 0, existed: 1 });
    expect(factsOf("0000320193")).toEqual(rows);
  });

  it("lets the cursor move past a filing companyfacts does not carry yet, and takes it when it arrives", async () => {
    edgar.file("2026-09-18", 320193, "0000320193-26-000030", 31e9, true);
    const s1 = await run("2026-09-21");
    expect(s1.companies.pending).toMatchObject([{ ticker: "AAPL", accession: "0000320193-26-000030", since: "2026-09-21", attempts: 1 }]);
    expect(s1.cursorAfter).toBe("2026-09-18");
    expect(state().companies["0000320193"]).toMatchObject({ lastAccession: "0000320193-26-000010", pendingAccession: "0000320193-26-000030", pendingAttempts: 1 });

    // Nothing new in the index the next night; the company is retried because it owes.
    edgar.facts[320193].push({ end: "2026-09-18", val: 31e9, form: "10-Q", filed: "2026-09-18", accn: "0000320193-26-000030" });
    edgar.urls = [];
    const s2 = await run("2026-09-22");
    expect(factUrls()).toEqual(["https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json"]);
    expect(s2.companies.pending).toEqual([]);
    expect(state().companies["0000320193"]).toMatchObject({ lastAccession: "0000320193-26-000030", pendingSince: null, pendingAttempts: 0 });
  });

  it("gives up on a filing that never reaches companyfacts once owed for five days, and raises the alarm", async () => {
    // A 10-K/A that only adds exhibits: in the index, never in companyfacts.
    // Owed from Monday the 21st: pending on days 0 to 4, flagged on day 5, the sixth attempt.
    edgar.file("2026-09-18", 320193, "0000320193-26-000031", 0, true);
    for (const day of ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]) {
      edgar.listed.push(day);
      const s = await run(day);
      expect(s.companies.pending).toHaveLength(1);
      expect(s.alerts).toEqual([]);
    }
    edgar.listed.push("2026-09-26");
    const s = await run("2026-09-26");
    expect(s.companies.overdue).toMatchObject([{ ticker: "AAPL", since: "2026-09-21", attempts: 6 }]);
    expect(s.alerts).toEqual(["1 companies owing for 5 days or more: AAPL"]);
    expect(state().companies["0000320193"]).toMatchObject({
      lastAccession: "0000320193-26-000031",
      pendingSince: null,
      lastError: "filing 0000320193-26-000031 not in companyfacts after 5 days (6 attempts)",
    });
    // Given up: no longer fetched.
    edgar.listed.push("2026-09-27");
    edgar.urls = [];
    await run("2026-09-27");
    expect(factUrls()).toEqual([]);
  });

  it("keeps retrying a company that keeps failing, and flags it once owed for five days", async () => {
    edgar.failFacts.add(320193);
    edgar.file("2026-09-18", 320193, "0000320193-26-000030", 31e9);
    let s = await run("2026-09-21");
    expect(s.companies.failed).toMatchObject([{ ticker: "AAPL", accession: "0000320193-26-000030", attempts: 1 }]);
    for (const day of ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]) {
      edgar.listed.push(day);
      s = await run(day);
      expect(s.alerts).toEqual([]);
    }
    edgar.listed.push("2026-09-26");
    s = await run("2026-09-26");
    expect(s.companies.failed[0].attempts).toBe(6);
    expect(s.companies.overdue[0].reason).toMatch(/^failing for 5 days \(6 attempts\)/);
    expect(s.alerts).toEqual(["1 companies owing for 5 days or more: AAPL"]);
    edgar.failFacts.clear();
    edgar.listed.push("2026-09-27");
    s = await run("2026-09-27");
    expect(s.companies.ingested).toBe(1);
    expect(state().companies["0000320193"]).toMatchObject({ lastAccession: "0000320193-26-000030", pendingSince: null, lastError: null });
  });

  it("treats a listed day that EDGAR does not serve as an error, not as a quiet day", async () => {
    edgar.listed.push("2026-09-18");
    edgar.unserved.add("2026-09-18");
    await expect(run("2026-09-21")).rejects.toThrow(/listed for its quarter but EDGAR answered 403/);
    expect(state().cursor.lastIndexDate).toBe("2026-09-15");
  });

  it("loads a company that joined the universe even if it filed nothing", async () => {
    edgar.facts[789019] = [{ end: "2026-06-30", val: 80e9, form: "10-K", filed: "2026-07-30", accn: "0000789019-26-000070" }];
    const s = await run("2026-09-16", ["AAPL", "GOOG", "MSFT"]);
    expect(factUrls()).toEqual(["https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json"]);
    expect(s.companies.ingested).toBe(1);
  });

  it("raises the alarm when many companies fail in one run", async () => {
    const tickers = ["AAPL", "GOOG"];
    for (let i = 0; i < 5; i++) {
      const cik = 900 + i;
      edgar.facts[cik] = [];
      edgar.failFacts.add(cik);
      edgar.extraTickers[`X${i}`] = cik;
      tickers.push(`X${i}`);
    }
    const s = await run("2026-09-16", tickers);
    expect(s.alerts).toEqual(["5 of 5 companies failed in this run"]);
  });

  it("raises the alarm when the cursor has not moved for more than four days", async () => {
    const s = await run("2026-09-21");
    expect(s.alerts).toEqual(["the cursor is 6 days old (2026-09-15)"]);
  });

  it("stops the run when EDGAR refuses the requests", async () => {
    edgar.blocked = true;
    await expect(run("2026-09-21")).rejects.toThrow(/EDGAR refused/);
  });
});

describe("owedFor", () => {
  it("flags on the first run five calendar days after the debt started", () => {
    expect(owedFor("2026-09-21", "2026-09-25")).toEqual({ days: 4, overdue: false });
    expect(owedFor("2026-09-21", "2026-09-26")).toEqual({ days: PENDING_GIVE_UP_DAYS, overdue: true });
  });
});
