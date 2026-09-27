import { describe, expect, it } from "vitest";
import { FILTERS, FILTER_BY_ID, describeRange, formatFilterValue } from "../filters";
import { toGicsSector } from "../sectors";
import { judge } from "@/hooks/use-screener";
import { SCREENER_PRESETS, type ScreenerRow } from "@/types/screener";

describe("filter catalogue", () => {
  it("has one entry per id, and presets that are real ranges", () => {
    expect(new Set(FILTERS.map((f) => f.id)).size).toBe(FILTERS.length);
    for (const f of FILTERS) {
      expect(f.presets.length).toBeGreaterThan(0);
      for (const p of f.presets) {
        expect(p.min !== null || p.max !== null).toBe(true);
        if (p.min !== null && p.max !== null) expect(p.min).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it("builds every strategy from filters that exist", () => {
    for (const s of SCREENER_PRESETS) for (const id of Object.keys(s.filters)) expect(FILTER_BY_ID.has(id as never)).toBe(true);
  });

  it("writes a preset by its name and a custom range as a person types it", () => {
    const fpe = FILTER_BY_ID.get("forward_pe")!;
    expect(describeRange(fpe, 0, 15)).toBe("Under 15x");
    const gm = FILTER_BY_ID.get("gross_margin")!;
    expect(describeRange(gm, 0.4, null)).toBe("Over 40%");
    expect(describeRange(gm, 0.125, 0.3)).toBe("12.5% to 30%");
  });

  it("formats each kind of figure", () => {
    expect(formatFilterValue("money", 2.34e12)).toBe("$2.34T");
    expect(formatFilterValue("signed_percent", 0.123)).toBe("+12.3%");
    expect(formatFilterValue("multiple", 14.44)).toBe("14.4x");
    expect(formatFilterValue("rating", 1.5)).toBe("1.5");
  });
});

describe("sectors", () => {
  it("puts Yahoo's names and the table's strays on the eleven GICS sectors", () => {
    expect(toGicsSector("Technology")).toBe("Information Technology");
    expect(toGicsSector("Consumer Cyclical")).toBe("Consumer Discretionary");
    expect(toGicsSector("Financial Services")).toBe("Financials");
    expect(toGicsSector("Unknown")).toBeNull();
    expect(toGicsSector("Inc.")).toBeNull();
  });
});

describe("judge", () => {
  const row = { sector: "Financials", forward_pe: 12, gross_margin: null } as unknown as ScreenerRow;

  it("keeps a row inside every range", () => {
    expect(judge(row, { forward_pe: { min: 0, max: 15 } }, [])).toBe("in");
  });

  it("drops a row outside a range or a sector", () => {
    expect(judge(row, { forward_pe: { min: 0, max: 10 } }, [])).toBe("out");
    expect(judge(row, {}, ["Energy"])).toBe("out");
  });

  it("calls a row with no figure for a filter missing, not a match", () => {
    expect(judge(row, { gross_margin: { min: 0.4, max: null } }, [])).toBe("missing");
  });

  it("lets a filter with no bounds yet narrow nothing", () => {
    expect(judge(row, { gross_margin: { min: null, max: null } }, [])).toBe("in");
  });
});
