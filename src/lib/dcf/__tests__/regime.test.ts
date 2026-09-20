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

  it("flags a capex peak on capex above 25% of revenue or a terminal weight above 65% (Alphabet)", () => {
    // Alphabet: capex guided at $195–205B against ~$450B of revenue, quarterly FCF negative.
    const capex = detectRegimes({ ...quiet, capexToRevenue: 0.44 });
    expect(capex[0]).toMatchObject({ id: "capexPeak", tab: "EPS Multiple" });
    expect(capex[0].detail).toContain("44.0% of revenue");
    const terminal = detectRegimes({ ...quiet, terminalWeight: 0.7 });
    expect(terminal[0]).toMatchObject({ id: "capexPeak" });
    expect(terminal[0].detail).toContain("70.0% of value in the terminal");
    expect(detectRegimes({ ...quiet, capexToRevenue: 0.24, terminalWeight: 0.64 })).toEqual([]);
  });

  it("flags leverage above 2.5× EBITDA and demands the basis switch (FIS, Universal Health)", () => {
    const [r] = detectRegimes({ ...quiet, debtToEbitda: 3.4 });
    expect(r).toMatchObject({ id: "leveraged", tab: "DCF" });
    expect(r.recommendation).toMatch(/cash-flow basis switch/);
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

  it("stacks the labels a company earns, in a fixed order", () => {
    const all = detectRegimes({ lender: false, capexToRevenue: 0.3, terminalWeight: 0.7, debtToEbitda: 4, fcfMargin: 0.03, perimeter: { divergence: 0.2, acquisitions: null, divestitures: null } });
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
