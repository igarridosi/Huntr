import { describe, expect, it } from "vitest";
import {
  formIndexUrl,
  parseFormIndex,
  parseQuarterListing,
  planDays,
  quarterOf,
  quartersBetween,
  relevantFilings,
  todayInNewYork,
} from "../daily-index";

// Lines as EDGAR serves them in form.20260915.idx: a header that wraps,
// then fixed-width columns padded with trailing spaces.
const INDEX = [
  "Description:           Daily Index of EDGAR Dissemination Feed by Form Type",
  "Last Data Received:    Sep 15, 2026",
  "Form Type   Company Name                                                  CIK",
  "      Date Filed  File Name",
  "---------------------------------------------------------------------------------------------------------------------------------------------",
  "10-K             Forgent Power Solutions, Inc.                                 2080126     20260915    edgar/data/2080126/0002080126-26-000035.txt                                                ",
  "10-Q/A           Where Food Comes From, Inc.                                   1360565     20260915    edgar/data/1360565/0001493152-26-042699.txt                                                ",
  "10-KT            Some Company  Inc                                             320193      20260915    edgar/data/320193/0000320193-26-000099.txt      ",
  "SC 13G/A         APPLE INC                                                     320193      20260915    edgar/data/320193/0000950123-26-000001.txt      ",
  "10-Q             APPLE INC                                                     320193      20260915    edgar/data/320193/0000320193-26-000010.txt      ",
  "8-K              5E Advanced Materials, Inc.                                   1888654     20260915    edgar/data/1888654/0001193125-26-391409.txt                                                ",
].join("\r\n");

describe("daily index paths", () => {
  it("puts the year and the quarter in the path", () => {
    expect(quarterOf("2026-01-02")).toBe(1);
    expect(quarterOf("2026-09-30")).toBe(3);
    expect(quarterOf("2026-10-01")).toBe(4);
    expect(formIndexUrl("2026-09-15")).toBe("https://www.sec.gov/Archives/edgar/daily-index/2026/QTR3/form.20260915.idx");
  });

  it("walks the quarters across a year end", () => {
    expect(quartersBetween("2025-11-20", "2026-02-03")).toEqual([
      { year: 2025, quarter: 4 },
      { year: 2026, quarter: 1 },
    ]);
  });
});

describe("parsing", () => {
  it("reads the days a quarter lists, ignoring the other index files", () => {
    const listing = {
      directory: {
        item: [{ name: "company.20260915.idx" }, { name: "form.20260916.idx" }, { name: "form.20260915.idx" }, { name: "master.20260915.idx" }, { name: "form.gz" }],
      },
    };
    expect(parseQuarterListing(listing)).toEqual(["2026-09-15", "2026-09-16"]);
    expect(parseQuarterListing(null)).toEqual([]);
  });

  it("parses fixed-width rows, form types with a space included", () => {
    const rows = parseFormIndex(INDEX);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({ form: "10-K", company: "Forgent Power Solutions, Inc.", cik: 2080126, filed: "2026-09-15", accession: "0002080126-26-000035" });
    expect(rows.find((r) => r.form === "SC 13G/A")).toMatchObject({ cik: 320193, accession: "0000950123-26-000001" });
    expect(rows.find((r) => r.form === "10-KT")?.company).toBe("Some Company  Inc");
  });

  it("keeps reviewed forms of companies in the universe only (no 10-KT, no 8-K, no 13G)", () => {
    const got = relevantFilings(parseFormIndex(INDEX), new Set([320193, 1360565]));
    expect(got.map((f) => `${f.form} ${f.cik}`)).toEqual(["10-Q/A 1360565", "10-Q 320193"]);
  });
});

describe("planDays", () => {
  // Fri 11, Mon 14, Tue 15 are listed; the weekend of 12-13 is not.
  const listed = ["2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15"];

  it("on the first run reads nothing and points the cursor at the last published day", () => {
    expect(planDays(null, listed, "2026-09-16")).toEqual({ days: [], nextCursor: "2026-09-15", lastPublished: "2026-09-15" });
  });

  it("steps over a weekend: unlisted days before the last listed one had no filings", () => {
    expect(planDays("2026-09-11", listed, "2026-09-16")).toEqual({ days: ["2026-09-14", "2026-09-15"], nextCursor: "2026-09-15", lastPublished: "2026-09-15" });
  });

  it("waits for a day that is not published yet instead of skipping it", () => {
    // Today is the 16th and its index is not out: the cursor stays on the 15th.
    const plan = planDays("2026-09-15", listed, "2026-09-16");
    expect(plan).toEqual({ days: [], nextCursor: "2026-09-15", lastPublished: "2026-09-15" });
  });

  it("never reads a listed day after today", () => {
    expect(planDays("2026-09-11", listed, "2026-09-14").days).toEqual(["2026-09-14"]);
  });
});

describe("todayInNewYork", () => {
  it("is still yesterday in New York in the small hours UTC", () => {
    expect(todayInNewYork(new Date("2026-09-16T03:00:00Z"))).toBe("2026-09-15");
    expect(todayInNewYork(new Date("2026-09-16T06:00:00Z"))).toBe("2026-09-16");
  });
});
