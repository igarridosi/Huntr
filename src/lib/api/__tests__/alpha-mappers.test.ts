import { describe, expect, it } from "vitest";
import { mapBalance, mapCashFlow, mapIncome } from "../alphavantage";

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
