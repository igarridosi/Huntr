import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateCompany, type BenchmarkRaw, type BenchmarkResult } from "../benchmark";

/**
 * The benchmark universe, replayed offline.
 *
 * Each fixture is one company's raw data as the app fetched it - quote,
 * statements, filings, exchange rate - frozen by
 * `node scripts/dcf-benchmark.mjs --capture`, with the evaluation accepted
 * at the time. Any change to how the page reads a company shows up here as
 * a diff for that company. When the change is intended, re-capture and read
 * reports/dcf-benchmark/latest.md before committing the new fixtures.
 */
const DIR = path.join(__dirname, "fixtures", "benchmark");
const fixtures = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()
  : [];

afterEach(() => {
  vi.useRealTimers();
});

describe("DCF benchmark: each company read as accepted", () => {
  it("has a universe to replay", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(40);
  });

  for (const file of fixtures) {
    const { capturedAt, raw, expected } = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as {
      capturedAt: string;
      raw: BenchmarkRaw;
      expected: BenchmarkResult;
    };
    it(`${expected.ticker}: ${expected.verdict}`, () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(capturedAt));
      const result = JSON.parse(JSON.stringify(evaluateCompany(raw)));
      expect(result).toEqual(expected);
      // The bar the universe was accepted at: no company with a figure wrong.
      expect(result.failures).toEqual([]);
    });
  }
});
