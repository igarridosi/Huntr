import { describe, expect, it } from "vitest";
import { runDCF, type DCFInputs, type DCFScenarioKey, type DCFScenarioSet } from "@/lib/calculations";
import { daysUntil, fairValueOf, gapOf, nextEvent, sortIdeas, stanceOf, summarize, trendOf, type IdeaRank } from "../ideas";

const base: DCFInputs = {
  baseRevenue: 100e9,
  baseFCFMargin: 0.2,
  growthRatePhase1: 0.08,
  growthRatePhase2: 0.05,
  yearsPhase1: 5,
  yearsPhase2: 5,
  terminalFCFMargin: 0.2,
  wacc: 0.09,
  terminalGrowthRate: 0.025,
  totalDebt: 10e9,
  cashAndEquivalents: 20e9,
  sharesOutstanding: 1e9,
  currentPrice: 0,
};

const preset = (key: DCFScenarioKey, growth: number) => ({
  key,
  label: key === "bear" ? ("Bear" as const) : key === "base" ? ("Base" as const) : ("Bull" as const),
  icon: key === "bear" ? ("🐻" as const) : key === "base" ? ("⚓" as const) : ("🐂" as const),
  inputs: { ...base, growthRatePhase1: growth },
});

const set: DCFScenarioSet = {
  bear: preset("bear", 0.02),
  base: preset("base", 0.08),
  bull: preset("bull", 0.14),
  waccEstimate: { costOfEquity: 0.1, costOfDebt: 0.05, wacc: 0.09, weightEquity: 0.9, weightDebt: 0.1 },
};

describe("fairValueOf", () => {
  it("values the saved DCF on the scenario it was saved on, with bear and bull as the range", () => {
    const fair = fairValueOf({ scenarios: set, activeScenario: "base" }, 50);
    expect(fair?.source).toBe("dcf");
    expect(fair?.value).toBeCloseTo(runDCF(set.base.inputs).intrinsicValuePerShare, 6);
    expect(fair!.low!).toBeLessThan(fair!.value);
    expect(fair!.high!).toBeGreaterThan(fair!.value);
  });

  it("falls back to the typed buy price, and to nothing", () => {
    expect(fairValueOf(null, 120)).toEqual({ value: 120, source: "target" });
    expect(fairValueOf(undefined, null)).toBeNull();
    expect(fairValueOf(null, 0)).toBeNull();
  });

  it("passes over a DCF out of all proportion to the price", () => {
    const value = runDCF(set.base.inputs).intrinsicValuePerShare;
    expect(fairValueOf({ scenarios: set, activeScenario: "base" }, 80, value / 10)).toEqual({ value: 80, source: "target" });
    expect(fairValueOf({ scenarios: set, activeScenario: "base" }, null, value * 0.8)?.source).toBe("dcf");
  });

  it("uses the typed price when the DCF cannot value the company", () => {
    const broken: DCFScenarioSet = { ...set, base: { ...set.base, inputs: { ...base, sharesOutstanding: 0 } } };
    expect(fairValueOf({ scenarios: broken, activeScenario: "base" }, 80)).toEqual({ value: 80, source: "target" });
  });
});

describe("gapOf and stanceOf", () => {
  const fair = { value: 100, source: "target" as const };
  it("measures the price against the fair value", () => {
    expect(gapOf(88, fair)).toBeCloseTo(-0.12, 10);
    expect(gapOf(104, fair)).toBeCloseTo(0.04, 10);
    expect(gapOf(null, fair)).toBeNull();
    expect(gapOf(100, null)).toBeNull();
  });

  it("reads at or below as a buy, within 10% above as near", () => {
    expect(stanceOf(-0.12)).toBe("buy");
    expect(stanceOf(0)).toBe("buy");
    expect(stanceOf(0.1)).toBe("near");
    expect(stanceOf(0.25)).toBe("far");
    expect(stanceOf(null)).toBe("none");
  });
});

describe("daysUntil and nextEvent", () => {
  const now = Date.parse("2026-10-25T15:00:00Z");
  it("counts calendar days and drops the past", () => {
    expect(daysUntil("2026-10-25", now)).toBe(0);
    expect(daysUntil("2026-10-28", now)).toBe(3);
    expect(daysUntil("2026-10-20", now)).toBeNull();
    expect(daysUntil(null, now)).toBeNull();
  });

  it("takes the nearer of earnings and ex-dividend", () => {
    expect(nextEvent("2026-11-02", "2026-10-30", now)).toEqual({ kind: "ex-dividend", days: 5, date: "2026-10-30" });
    expect(nextEvent("2026-10-28", "2026-10-30", now)).toEqual({ kind: "earnings", days: 3, date: "2026-10-28" });
    expect(nextEvent(null, null, now)).toBeNull();
  });
});

const idea = (ticker: string, o: Partial<IdeaRank> = {}): IdeaRank => ({ ticker, gap: null, event: null, quality: null, change: null, ...o });

describe("sortIdeas", () => {
  const list = [
    idea("A", { gap: 0.3, quality: 50, change: 0.01 }),
    idea("B", { gap: -0.1, quality: 80, change: -0.02, event: { kind: "earnings", days: 9, date: "" } }),
    idea("C", { quality: 90, event: { kind: "earnings", days: 2, date: "" } }),
    idea("D", { gap: 0.05, change: -0.01 }),
    idea("E", { quality: 95 }),
    idea("F"),
  ];
  it("puts the closest to a buy first, then the unvalued, best business first", () => {
    expect(sortIdeas(list, "closest").map((i) => i.ticker)).toEqual(["B", "D", "A", "E", "C", "F"]);
  });
  it("orders by next event and quality", () => {
    expect(sortIdeas(list, "event").map((i) => i.ticker)).toEqual(["C", "B", "A", "D", "E", "F"]);
    expect(sortIdeas(list, "quality").map((i) => i.ticker)).toEqual(["E", "C", "B", "A", "D", "F"]);
  });
});

describe("trendOf", () => {
  it("reads the month's move", () => {
    expect(trendOf(0.12)).toBe("rocket");
    expect(trendOf(0.03)).toBe("bull");
    expect(trendOf(-0.01)).toBe("neutral");
    expect(trendOf(-0.05)).toBe("bear");
    expect(trendOf(-0.2)).toBe("strong-bear");
    expect(trendOf(null)).toBeNull();
  });
});

describe("summarize", () => {
  it("counts what the day asks about", () => {
    const s = summarize([
      idea("A", { gap: -0.05, change: 0.02, event: { kind: "earnings", days: 3, date: "" } }),
      idea("B", { gap: 0.08, change: -0.04 }),
      idea("C", { event: { kind: "ex-dividend", days: 2, date: "" } }),
    ]);
    expect(s).toEqual({ inBuyZone: 1, near: 1, earningsThisWeek: 1, today: -0.01, unvalued: 1 });
  });
});
