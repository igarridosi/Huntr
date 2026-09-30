import { describe, expect, it } from "vitest";
import { factRows, latestFiling, payloadHasAccession, rowKey, windowStart } from "../facts-rows";

const payload = {
  facts: {
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: { shares: [{ end: "2026-07-17", val: 14_700_000_000, form: "10-Q", filed: "2026-08-01", accn: "0000320193-26-000010" }] },
      },
    },
    "us-gaap": {
      CashAndCashEquivalentsAtCarryingValue: {
        units: {
          USD: [
            { end: "2026-06-27", val: 30e9, form: "10-Q", filed: "2026-08-01", accn: "0000320193-26-000010" },
            // The same balance as a comparative in the next filing: kept, it is another row.
            { end: "2026-06-27", val: 30e9, form: "10-K", filed: "2026-10-30", accn: "0000320193-26-000020" },
            { end: "2026-06-27", val: 1, form: "8-K", filed: "2026-08-01", accn: "0000320193-26-000011" },
            { end: "2026-06-27", val: 2, form: "10-KT", filed: "2026-08-01", accn: "0000320193-26-000012" },
            { end: "2020-06-27", val: 3, form: "10-K", filed: "2020-10-30", accn: "0000320193-20-000096" },
            { end: "2026-03-28", val: 28e9, filed: "2026-05-02", accn: "0000320193-26-000005" },
            { end: "2026-03-28", val: 28e9, form: "10-Q", filed: "2026-05-02", accn: "not-an-accession" },
          ],
        },
      },
      Revenues: {
        units: { USD: [{ start: "2025-09-28", end: "2026-06-27", val: 300e9, form: "10-Q", filed: "2026-08-01", accn: "0000320193-26-000010" }] },
      },
      // Read by nobody: not stored.
      AccountsPayableCurrent: {
        units: { USD: [{ end: "2026-06-27", val: 50e9, form: "10-Q", filed: "2026-08-01", accn: "0000320193-26-000013" }] },
      },
    },
  },
};

describe("factRows", () => {
  const { rows, dropped } = factRows(payload, 320193, "2023-09-30");

  it("keeps the 42 concepts, reviewed forms and unlabelled rows, inside the window", () => {
    expect(rows.map((r) => `${r.conceptId} ${r.form ?? "-"} ${r.periodEnd} ${r.accession}`)).toEqual([
      "1 10-Q 2026-07-17 0000320193-26-000010",
      "3 10-Q 2026-06-27 0000320193-26-000010",
      "3 10-K 2026-06-27 0000320193-26-000020",
      "3 - 2026-03-28 0000320193-26-000005",
      "26 10-Q 2026-06-27 0000320193-26-000010",
    ]);
    expect(dropped).toEqual({ form: 2, window: 1, malformed: 1 });
  });

  it("stores an instant with no start and a flow with its start", () => {
    expect(rows[1].periodStart).toBeNull();
    expect(rows[4].periodStart).toBe("2025-09-28");
  });

  it("gives two copies of one period two keys, one per filing", () => {
    expect(rowKey(rows[1])).not.toBe(rowKey(rows[2]));
    expect(rowKey(rows[1])).toBe("320193|3|USD|2026-06-27||0000320193-26-000010");
  });

  it("finds the latest filing among the rows", () => {
    expect(latestFiling(rows)).toEqual({ accession: "0000320193-26-000020", filed: "2026-10-30" });
    expect(latestFiling([])).toBeNull();
  });
});

describe("payloadHasAccession", () => {
  it("looks at every concept, not only the ones stored", () => {
    expect(payloadHasAccession(payload, "0000320193-26-000013")).toBe(true);
    expect(payloadHasAccession(payload, "0000320193-26-999999")).toBe(false);
  });
});

describe("windowStart", () => {
  it("is three years before today", () => {
    expect(windowStart("2026-09-30", 3)).toBe("2023-09-30");
  });
});
