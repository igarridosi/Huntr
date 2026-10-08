import { describe, expect, it } from "vitest";
import { assessReliability, gradeFor, type ReliabilityInput } from "../reliability";
import type { FieldProvenance } from "../provenance";

const prov = (field: FieldProvenance["field"], source: FieldProvenance["source"], verified: boolean): FieldProvenance => ({
  field, value: 1, source, verified, document: null, periodStart: null, periodEnd: null, note: "",
});

const allVerified: FieldProvenance[] = [
  prov("baseRevenue", "sec", true),
  prov("fcfMargin", "yahoo", true),
  prov("netDebt", "sec", true),
  prov("sharesOutstanding", "sec", true),
  prov("currentPrice", "market", false),
];

const ideal: ReliabilityInput = {
  provenance: allVerified,
  unresolved: 0,
  checks: [
    { id: "marketCap", label: "Market cap = shares × price", status: "pass", detail: "" },
    { id: "fcfQuarters", label: "Four quarters of FCF = fiscal-year FCF", status: "pass", detail: "" },
    { id: "totalDebt", label: "Total debt = filed debt", status: "pass", detail: "" },
    { id: "revenuePerimeter", label: "Revenue period matches today's perimeter", status: "pass", detail: "" },
    { id: "marginRecord", label: "Usable margin record", status: "pass", detail: "" },
  ],
  regimes: [],
  converted: false,
  marginRecord: { years: 5, comparable: true, volatile: false, negativeYears: 0, latestNegative: false },
  terminalWeight: 0.45,
  spread: 0.06,
  waccSensitivity: 0.1,
  growthAboveRecord: false,
  terminalMarginAboveRecord: false,
  dispersion: 0.8,
};

describe("assessReliability", () => {
  it("gives A to filed inputs, a model that fits and room in the assumptions", () => {
    const r = assessReliability(ideal);
    expect(r.score).toBe(100);
    expect(r.grade).toBe("A");
    expect(r.detractors).toEqual([]);
  });

  it("scores Instacart as of 8 October 2026 around a B, and names what costs most", () => {
    // Manual revenue base, debt confirmed by hand, two checks not verifiable,
    // four volatile years, 58% terminal weight, 6.5-point spread, Bull and
    // Bear 1.3x the Base apart.
    const cart = assessReliability({
      ...ideal,
      provenance: [prov("baseRevenue", "manual", false), prov("fcfMargin", "yahoo", true), prov("netDebt", "manual", false), prov("sharesOutstanding", "sec", true), prov("currentPrice", "market", false)],
      checks: ideal.checks.map((c) => (c.id === "fcfQuarters" || c.id === "totalDebt" ? { ...c, status: "unverifiable" as const } : c)),
      marginRecord: { years: 4, comparable: true, volatile: true, negativeYears: 0, latestNegative: false },
      terminalWeight: 0.58,
      spread: 0.065,
      waccSensitivity: 0.17,
      dispersion: 1.25,
    });
    expect(cart.grade).toBe("B");
    expect(cart.score).toBeGreaterThanOrEqual(70);
    expect(cart.score).toBeLessThan(85);
    // The swinging record and the figures typed by hand cost the most, and
    // the revenue base says how to win its points back.
    expect(cart.detractors.map((d) => d.block)).toEqual(expect.arrayContaining(["fit", "data"]));
    expect(cart.detractors.some((d) => d.fix?.includes("trailing twelve months"))).toBe(true);
  });

  it("sends a lender to D whatever the data", () => {
    const sofi = assessReliability({ ...ideal, regimes: ["lender"], checks: ideal.checks.map((c) => (c.id === "marginRecord" ? { ...c, status: "fail" as const } : c)) });
    expect(sofi.grade).toBe("D");
    expect(sofi.detractors[0].label).toMatch(/Lender/);
  });

  it("marks down a value that rests on a thin spread and a heavy terminal (Haleon's automatic Bull at 44x)", () => {
    const r = assessReliability({ ...ideal, terminalWeight: 0.82, spread: 0.0225, waccSensitivity: 0.3 });
    const robustness = r.blocks.find((b) => b.id === "robustness")!;
    expect(robustness.score).toBeLessThan(30);
    expect(r.grade).not.toBe("A");
  });

  it("marks down a figure nobody has answered yet, and says how to answer it", () => {
    const r = assessReliability({ ...ideal, unresolved: 1 });
    expect(r.blocks[0].score).toBe(75);
    expect(r.detractors[0].fix).toMatch(/confirm the zero/);
  });

  it("grades on fixed thresholds", () => {
    expect([gradeFor(85), gradeFor(84), gradeFor(70), gradeFor(69), gradeFor(55), gradeFor(54)]).toEqual(["A", "B", "B", "C", "C", "D"]);
  });
});
