import { describe, expect, it } from "vitest";
import { debtPaydown, detectRegimes, type RegimeInput } from "../regime";

const quiet: RegimeInput = {
  lender: false,
  capexToRevenue: 0.05,
  terminalWeight: 0.55,
  debtToEbitda: 1.2,
  fcfMargin: 0.15,
  perimeter: { divergence: 0.03, acquisitions: null, divestitures: null },
};

describe("detectRegimes", () => {
  it("says nothing about an ordinary operating business", () => {
    expect(detectRegimes(quiet)).toEqual([]);
  });

  it("sends a lender or insurer to the EPS Multiple tab (SoFi)", () => {
    const [r] = detectRegimes({ ...quiet, lender: true });
    expect(r).toMatchObject({ id: "lender", tab: "EPS Multiple" });
  });

  it("flags a capex peak on capex above 25% of revenue and above its own history (Alphabet)", () => {
    // Alphabet: capex guided at $195–205B against ~$450B of revenue, quarterly FCF negative.
    const capex = detectRegimes({ ...quiet, capexToRevenue: 0.44, capexHistory: [0.12, 0.13, 0.15] });
    expect(capex[0]).toMatchObject({ id: "capexPeak", tab: "EPS Multiple" });
    expect(capex[0].detail).toContain("44.0% of revenue");
    expect(capex[0].detail).toContain("against 13.0% in earlier years");
    // A business that always spends this much is not at a peak.
    expect(detectRegimes({ ...quiet, capexToRevenue: 0.3, capexHistory: [0.28, 0.3, 0.29] })).toEqual([]);
    expect(detectRegimes({ ...quiet, capexToRevenue: 0.24, terminalWeight: 0.64 })).toEqual([]);
  });

  it("flags a peak below 25% when the company's own history shows the jump (Alphabet, FY2025)", () => {
    // 22.7% of revenue in 2025 against 12-13% before: missed at the flat 25%.
    const [peak] = detectRegimes({ ...quiet, capexToRevenue: 0.227, capexHistory: [0.12, 0.13, 0.12] });
    expect(peak).toMatchObject({ id: "capexPeak" });
    expect(detectRegimes({ ...quiet, capexToRevenue: 0.14, capexHistory: [0.08, 0.09] })).toEqual([]);
    expect(detectRegimes({ ...quiet, capexToRevenue: 0.2, capexHistory: [0.18, 0.19] })).toEqual([]);
  });

  it("keeps a heavy terminal weight apart from a capex peak (Haleon)", () => {
    // Haleon: capex about 3% of revenue, 66.5% of the value in the terminal.
    const hln = detectRegimes({ ...quiet, capexToRevenue: 0.03, capexHistory: [0.03, 0.035], terminalWeight: 0.665 });
    expect(hln.map((r) => r.id)).toEqual(["terminalHeavy"]);
    expect(hln[0].detail).toBe("66.5% of value in the terminal");
    expect(hln[0].tab).toBeNull();
  });

  it("flags leverage above 2.5× EBITDA and points at the paydown (FIS, Universal Health)", () => {
    const [r] = detectRegimes({ ...quiet, debtToEbitda: 3.4 });
    expect(r).toMatchObject({ id: "leveraged", tab: "DCF" });
    expect(r.recommendation).toMatch(/paydown schedule/);
    expect(r.detail).toBe("debt 3.4× EBITDA");
  });

  it("flags a margin under 6% and says what half a point does (Universal Health at 4.7%)", () => {
    const [r] = detectRegimes({ ...quiet, fcfMargin: 0.047 });
    expect(r).toMatchObject({ id: "thinMargin" });
    // 0.5 points on 4.7% is 10.6% of the value.
    expect(r.recommendation).toContain("10.6%");
    expect(detectRegimes({ ...quiet, fcfMargin: 0.06 })).toEqual([]);
  });

  it("flags a shifting perimeter on a divergence over 10% or a business bought or sold (Celsius, S&P Global)", () => {
    const celh = detectRegimes({ ...quiet, perimeter: { divergence: 0.2115, acquisitions: { value: 1_650e6, periodEnd: "2025-12-31" }, divestitures: null } });
    expect(celh[0]).toMatchObject({ id: "shiftingPerimeter" });
    expect(celh[0].detail).toContain("acquisition of $1.65B to 2025-12-31");
    expect(celh[0].detail).toContain("21.1% above the closed year");
    const spgi = detectRegimes({ ...quiet, perimeter: { divergence: 0.05, acquisitions: null, divestitures: { value: 3_000e6, periodEnd: "2026-09-30" } } });
    expect(spgi[0].detail).toBe("disposal of $3.00B to 2026-09-30");
  });

  it("does not call growth or an immaterial deal a new perimeter (Reddit +26% TTM, Instacart's $29M)", () => {
    expect(detectRegimes({ ...quiet, perimeter: { divergence: 0.262, acquisitions: null, divestitures: null, revenue: 2_200e6 } })).toEqual([]);
    expect(detectRegimes({ ...quiet, perimeter: { divergence: 0.02, acquisitions: { value: 29e6, periodEnd: "2026-06-30" }, divestitures: null, revenue: 3_993e6 } })).toEqual([]);
    // Celsius's $1.65B against about $2.5B of revenue is material.
    const celh = detectRegimes({ ...quiet, perimeter: { divergence: 0.2115, acquisitions: { value: 1_650e6, periodEnd: "2025-12-31" }, divestitures: null, revenue: 2_500e6 } });
    expect(celh[0].id).toBe("shiftingPerimeter");
  });

  it("stacks the labels a company earns, in a fixed order", () => {
    const all = detectRegimes({ lender: false, capexToRevenue: 0.3, terminalWeight: 0.7, debtToEbitda: 4, fcfMargin: 0.03, perimeter: { divergence: 0.2, acquisitions: { value: 500e6, periodEnd: "2026-06-30" }, divestitures: null, revenue: 2_000e6 } });
    expect(all.map((r) => r.id)).toEqual(["capexPeak", "leveraged", "thinMargin", "shiftingPerimeter"]);
  });
});

describe("debtPaydown", () => {
  it("repays year by year from the projected flows and says when it is done", () => {
    const { schedule, yearsToRepay } = debtPaydown(250, [100, 100, 100, 100]);
    expect(yearsToRepay).toBe(3);
    expect(schedule.map((y) => y.debtEnd)).toEqual([150, 50, 0, 0]);
    expect(schedule[2].repaid).toBe(50);
    expect(debtPaydown(1_000, [100, 100]).yearsToRepay).toBeNull();
    expect(debtPaydown(0, [100]).yearsToRepay).toBe(0);
    // A negative year repays nothing and does not add to the debt.
    expect(debtPaydown(100, [-50, 200]).schedule.map((y) => y.debtEnd)).toEqual([100, 0]);
  });
});
