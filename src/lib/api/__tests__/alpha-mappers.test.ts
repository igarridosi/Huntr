import { describe, expect, it } from "vitest";
import { mapBalance, mapCashFlow, mapIncome } from "../alphavantage";
import { repairAlphaFinancials } from "../alpha-repair";

/**
 * Alpha Vantage files the same figure under different keys depending on
 * the company and writes "None" for the rest. A mapper that reads one key
 * shows a real buyback programme as $0 — which is what Adobe's looked like.
 */
describe("Alpha Vantage statement mappers", () => {
  it("reads buybacks and dividends from whichever key the filer used", () => {
    const [a, b, c] = mapCashFlow(
      [
        { fiscalDateEnding: "2022-12-02", operatingCashflow: "100", capitalExpenditures: "10", paymentsForRepurchaseOfCommonStock: "None", paymentsForRepurchaseOfEquity: "6550000000", dividendPayout: "None", dividendPayoutCommonStock: "12" },
        { fiscalDateEnding: "2023-12-01", operatingCashflow: "100", capitalExpenditures: "10", paymentsForRepurchaseOfCommonStock: "4400000000", dividendPayout: "12" },
        { fiscalDateEnding: "2024-11-29", operatingCashflow: "100", capitalExpenditures: "10", paymentsForRepurchaseOfCommonStock: "None", paymentsForRepurchaseOfEquity: "None", proceedsFromRepurchaseOfEquity: "-9500000000" },
      ],
      "annual"
    );
    expect(a.share_repurchases).toBe(6_550_000_000);
    expect(a.dividends_paid).toBe(12);
    expect(b.share_repurchases).toBe(4_400_000_000);
    expect(c.share_repurchases).toBe(-9_500_000_000);
  });

  it("derives income-statement figures the filer left as None", () => {
    const [row] = mapIncome(
      [
        {
          fiscalDateEnding: "2024-12-31",
          totalRevenue: "1000",
          costOfRevenue: "None",
          costofGoodsAndServicesSold: "400",
          grossProfit: "None",
          operatingExpenses: "None",
          sellingGeneralAndAdministrative: "200",
          researchAndDevelopment: "100",
          operatingIncome: "300",
          ebitda: "None",
          depreciationAndAmortization: "50",
          interestExpense: "None",
          interestAndDebtExpense: "7",
          netIncome: "250",
        },
      ],
      "annual",
      new Map(),
      new Map(),
      new Map(),
      new Map()
    );
    expect(row.cost_of_revenue).toBe(400);
    expect(row.gross_profit).toBe(600);
    expect(row.operating_expenses).toBe(300);
    expect(row.ebitda).toBe(350);
    expect(row.interest_expense).toBe(7);
  });

  it("derives balance-sheet totals from what is reported", () => {
    const [row] = mapBalance(
      [
        {
          fiscalDateEnding: "2024-12-31",
          totalAssets: "1000",
          totalCurrentAssets: "400",
          totalNonCurrentAssets: "None",
          totalLiabilities: "None",
          totalCurrentLiabilities: "150",
          totalNonCurrentLiabilities: "None",
          totalShareholderEquity: "600",
          longTermDebt: "None",
          longTermDebtNoncurrent: "200",
          cashAndCashEquivalentsAtCarryingValue: "None",
          cashAndShortTermInvestments: "90",
        },
      ],
      "annual"
    );
    expect(row.total_non_current_assets).toBe(600);
    expect(row.total_liabilities).toBe(400);
    expect(row.total_non_current_liabilities).toBe(250);
    expect(row.long_term_debt).toBe(200);
    expect(row.cash_and_equivalents).toBe(90);
  });
});

describe("Alpha Vantage cash flow signs", () => {
  it("stores capex as an outflow and free cash flow as operations less capex", () => {
    const [row] = mapCashFlow([{ fiscalDateEnding: "2025-12-31", operatingCashflow: "254737000", capitalExpenditures: "42667000" }], "annual");
    expect(row.capital_expenditures).toBe(-42_667_000);
    expect(row.free_cash_flow).toBe(212_070_000);
    expect(Object.is(row.capital_expenditures, -0)).toBe(false);
  });

  it("repairs a bundle cached with the old sign and leaves a correct one untouched", () => {
    const cf = (ocf: number, capex: number, fcf: number) => ({ period: "2025", date: "2025-12-31", currency: "USD", operating_cash_flow: ocf, capital_expenditures: capex, free_cash_flow: fcf, dividends_paid: 0, share_repurchases: 0, net_investing: 0, net_financing: 0, net_change_in_cash: 0 });
    const empty = { annual: [], quarterly: [] };
    const stale = { ticker: "YETI", income_statement: empty, balance_sheet: empty, cash_flow: { annual: [cf(254_737_000, 42_667_000, 297_404_000)], quarterly: [] } };
    const fixed = repairAlphaFinancials(stale);
    expect(fixed.cash_flow.annual[0]).toMatchObject({ capital_expenditures: -42_667_000, free_cash_flow: 212_070_000 });
    const fresh = { ...stale, cash_flow: { annual: [cf(254_737_000, -42_667_000, 212_070_000)], quarterly: [] } };
    expect(repairAlphaFinancials(fresh).cash_flow.annual[0]).toBe(fresh.cash_flow.annual[0]);
    expect(repairAlphaFinancials(null)).toBeNull();
  });
});

describe("Alpha Vantage share counts", () => {
  it("backs shares out of net income only with the statement's own EPS, never the adjusted one from EARNINGS", () => {
    const rows = [{ fiscalDateEnding: "2024-12-31", netIncome: "175689000", totalRevenue: "1", dilutedEPS: "None" }];
    const adjusted = new Map([["2024-12-31", 2.75]]);
    const [noBalance] = mapIncome(rows, "annual", adjusted, new Map(), new Map(), new Map());
    expect(noBalance.eps_diluted).toBe(2.75);
    expect(noBalance.shares_outstanding_diluted).toBe(0);
    const [withBalance] = mapIncome(rows, "annual", adjusted, new Map(), new Map([["2024-12-31", 82_939_467]]), new Map());
    expect(withBalance.shares_outstanding_diluted).toBe(82_939_467);
    const [gaap] = mapIncome([{ ...rows[0], dilutedEPS: "2.05" }], "annual", adjusted, new Map(), new Map(), new Map());
    expect(Math.round(gaap.shares_outstanding_diluted)).toBe(85_701_951);
  });
});
