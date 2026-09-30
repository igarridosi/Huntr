import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The SEC parser, pinned to what it returned before it was extracted into
 * src/lib/sec. golden.json was written by the pre-extraction sec-edgar.ts
 * from the full EDGAR payloads on 2026-09-30; the fixtures are the same
 * payloads cut down to the 42 concepts the app reads, reviewed forms, and
 * periods ending from 2023. Same date, same answers: any change to how a
 * figure is chosen shows up here as a diff against the golden file.
 *
 * The companies are the ones that broke something before: Visa, Berkshire
 * and Alphabet (share counts by class, read from the filing), Haleon and
 * TSMC (IFRS filers with nothing under us-gaap), ExxonMobil (almost no
 * tags), Lululemon (a cover count of one class), Ford (abandoned tags),
 * Starbucks (restricted cash folded into cash), Apple, and a ticker with
 * no CIK.
 */
const FIXTURES = path.join(__dirname, "fixtures");
const golden = JSON.parse(fs.readFileSync(path.join(FIXTURES, "golden.json"), "utf8")) as {
  now: string;
  results: Record<string, { fundamentals: unknown; perConcept: Record<string, unknown> }>;
};

/** EDGAR, served from the fixtures; anything not on file is a 404, as EDGAR says it. */
function serve(url: string): Response {
  const u = String(url);
  let file: string | null = null;
  if (u.endsWith("company_tickers.json")) file = "company_tickers.json";
  else if (u.includes("/companyfacts/CIK")) file = `facts_${/CIK(\d{10})/.exec(u)![1]}.json`;
  else if (u.includes("/submissions/CIK")) file = `sub_${/CIK(\d{10})/.exec(u)![1]}.json`;
  else if (u.includes("/Archives/edgar/data/")) file = `doc_${String(/data\/(\d+)\//.exec(u)![1]).padStart(10, "0")}.htm`;
  const p = file ? path.join(FIXTURES, file) : null;
  return p && fs.existsSync(p) ? new Response(fs.readFileSync(p)) : new Response("", { status: 404 });
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(golden.now));
  vi.stubGlobal("fetch", async (url: string) => serve(url));
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SEC fundamentals against the pre-extraction golden file", () => {
  for (const [ticker, expected] of Object.entries(golden.results)) {
    it(`${ticker}: same fundamentals, and the same fact for every concept and period`, async () => {
      const sec = await import("@/lib/api/sec-edgar");
      const got = await sec.getSECFundamentals(ticker);
      expect(JSON.parse(JSON.stringify(got))).toEqual(expected.fundamentals);
      if (!got) return;
      for (const [key, list] of Object.entries(sec.SEC_CONCEPTS)) {
        for (const period of ["any", "quarterly", "annual"] as const) {
          const fact = await sec.fetchConcept(got.cik, list, period, key === "sharesOutstandingCover" ? "dei" : "us-gaap");
          expect(JSON.parse(JSON.stringify(fact)), `${key} ${period}`).toEqual(expected.perConcept[`${key}:${period}`]);
        }
      }
    });
  }

  it("covers the companies it says it covers", () => {
    expect(Object.keys(golden.results)).toEqual(expect.arrayContaining(["AAPL", "V", "BRK-B", "GOOG", "HLN", "TSM", "XOM"]));
    expect((golden.results.V.fundamentals as { weightedDilutedShares: { concept: string } }).weightedDilutedShares.concept).toContain("by class");
  });
});
