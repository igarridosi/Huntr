import { describe, expect, it } from "vitest";
import { coversStatements, mergeFinancials, statementsFor } from "../data";
import { METRICS, METRIC_IDS } from "../metrics";
import { createSeries, createSpec } from "../spec";
import { fin } from "./fixtures";

describe("statementsFor", () => {
  it("asks only for what the metrics read, in a stable order", () => {
    const ebitda = createSpec({ series: ["A", "B"].map((t) => createSeries({ ticker: t, metric: "ebitda" })) });
    expect(statementsFor(ebitda)).toEqual(["income"]);
    const mix = createSpec({ series: [createSeries({ ticker: "A", metric: "free_cash_flow" }), createSeries({ ticker: "A", metric: "long_term_debt" })] });
    expect(statementsFor(mix)).toEqual(["balance", "cashflow"]);
    const px = createSpec({ series: [createSeries({ ticker: "A", metric: "price", shape: "line" })] });
    expect(statementsFor(px)).toEqual([]);
  });

  it("per-share transforms bring the income statement (share counts)", () => {
    const spec = createSpec({ series: [createSeries({ ticker: "A", metric: "free_cash_flow", transform: "per_share" })] });
    expect(statementsFor(spec)).toEqual(["income", "cashflow"]);
  });

  it("every metric declares its statements consistently with its source", () => {
    for (const id of METRIC_IDS) {
      const d = METRICS[id];
      if (d.source === "price") expect(d.statements).toEqual([]);
      else expect(d.statements.length).toBeGreaterThan(0);
      if (d.source === "market") expect(d.statements).toContain("income");
    }
  });
});

describe("mergeFinancials / coversStatements", () => {
  const quick = fin("A", { annual: [{ date: "2023-12-31", revenue: 1, fcf: 2, equity: 3 }] });
  const deepIncome = fin("A", { annual: [2019, 2020, 2021, 2022, 2023].map((y) => ({ date: `${y}-12-31`, revenue: 10 })) }, { statements: ["income"] });

  it("takes the overlay statement where it has rows and the quick data elsewhere", () => {
    const merged = mergeFinancials(quick, deepIncome)!;
    expect(merged.income_statement.annual).toHaveLength(5);
    expect(merged.cash_flow.annual[0].free_cash_flow).toBe(2);
    expect(merged.balance_sheet.annual[0].total_equity).toBe(3);
  });

  it("falls back to whichever side exists", () => {
    expect(mergeFinancials(null, deepIncome)).toBe(deepIncome);
    expect(mergeFinancials(quick, null)).toBe(quick);
    expect(mergeFinancials(undefined, undefined)).toBeNull();
  });

  it("coversStatements is true only when every requested statement has rows", () => {
    expect(coversStatements(deepIncome, ["income"])).toBe(true);
    expect(coversStatements(deepIncome, ["income", "cashflow"])).toBe(false);
    expect(coversStatements(null, ["income"])).toBe(false);
    expect(coversStatements(deepIncome, [])).toBe(true);
  });
});
