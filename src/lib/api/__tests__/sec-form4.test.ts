import { describe, expect, it } from "vitest";
import { listingsFrom, MAX_FILINGS } from "../sec-form4";

// The shape of data.sec.gov/submissions/CIK….json, trimmed to the columns read.
const feed = (rows: [form: string, accession: string, filingDate: string, doc: string][]) => ({
  filings: {
    recent: {
      form: rows.map((r) => r[0]),
      accessionNumber: rows.map((r) => r[1]),
      filingDate: rows.map((r) => r[2]),
      primaryDocument: rows.map((r) => r[3]),
    },
  },
});

describe("listingsFrom", () => {
  it("keeps Form 4 and 4/A inside the lookback and points at the raw XML beside the XSL view", () => {
    const { listings, truncated } = listingsFrom(
      feed([
        ["4", "0001104659-26-098372", "2026-08-18", "xslF345X06/tm2623398-3_4seq1.xml"],
        ["10-Q", "0001670592-26-000031", "2026-08-06", "yeti-20260627.htm"],
        ["4/A", "0001193125-26-131813", "2026-03-30", "xslF345X05/ownership.xml"],
        ["4", "0001104659-23-000001", "2023-01-05", "xslF345X04/old.xml"],
      ]),
      "0001670592",
      "2024-09-25"
    );
    expect(truncated).toBe(false);
    expect(listings).toEqual([
      { accession: "0001104659-26-098372", filingDate: "2026-08-18", xmlUrl: "https://www.sec.gov/Archives/edgar/data/1670592/000110465926098372/tm2623398-3_4seq1.xml" },
      { accession: "0001193125-26-131813", filingDate: "2026-03-30", xmlUrl: "https://www.sec.gov/Archives/edgar/data/1670592/000119312526131813/ownership.xml" },
    ]);
  });

  it("caps a heavy filer and says so, rather than silently reading part of the record", () => {
    const rows = Array.from({ length: MAX_FILINGS + 5 }, (_, i) => ["4", `acc-${i}`, "2026-06-01", "xslF345X06/f.xml"] as [string, string, string, string]);
    const { listings, truncated } = listingsFrom(feed(rows), "0000320193", "2024-09-25");
    expect(listings).toHaveLength(MAX_FILINGS);
    expect(truncated).toBe(true);
  });

  it("returns nothing for a payload that is not a submissions feed", () => {
    expect(listingsFrom(null, "1", "2024-01-01")).toEqual({ listings: [], truncated: false });
    expect(listingsFrom({ filings: {} }, "1", "2024-01-01")).toEqual({ listings: [], truncated: false });
  });
});
