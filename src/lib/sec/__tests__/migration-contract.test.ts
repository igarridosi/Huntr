import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { SEC_CONCEPT_IDS } from "../concept-ids";
import { OPERATING_CASH_FLOW_CONCEPTS, SEC_CONCEPTS } from "../concepts";
import { REVIEWED_FORMS } from "../forms";

// The table the ingest pipeline fills is read back by the app, so the two
// have to agree on what may be in it. The SQL is the other half of this
// contract; these tests fail when one side moves without the other.
const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/011_sec_company_facts.sql"), "utf8");

describe("migration 011 agrees with src/lib/sec", () => {
  it("accepts exactly the reviewed forms", () => {
    const check = /form\s+TEXT\s+CHECK \(form IS NULL OR form IN \(([^)]*)\)\)/.exec(sql);
    expect(check).not.toBeNull();
    const inSql = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(inSql).toEqual([...REVIEWED_FORMS]);
  });

  it("seeds exactly the concepts the app reads", () => {
    const seeded = [...sql.matchAll(/\(\s*\d+,\s*'(us-gaap|dei)',\s*'([A-Za-z]+)'\)/g)].map((m) => `${m[1]}:${m[2]}`);
    const read = [
      ...SEC_CONCEPTS.sharesOutstandingCover.map((c) => `dei:${c}`),
      ...Object.entries(SEC_CONCEPTS)
        .filter(([key]) => key !== "sharesOutstandingCover")
        .flatMap(([, list]) => list.map((c) => `us-gaap:${c}`)),
      ...OPERATING_CASH_FLOW_CONCEPTS.map((c) => `us-gaap:${c}`),
    ];
    expect(new Set(seeded).size).toBe(seeded.length);
    expect([...seeded].sort()).toEqual([...new Set(read)].sort());
  });

  it("gives every concept the id the migration seeded", () => {
    const seeded = [...sql.matchAll(/\(\s*(\d+),\s*'(us-gaap|dei)',\s*'([A-Za-z]+)'\)/g)].map((m) => [Number(m[1]), m[2], m[3]]);
    expect(SEC_CONCEPT_IDS.map((row) => [...row])).toEqual(seeded);
  });
});
