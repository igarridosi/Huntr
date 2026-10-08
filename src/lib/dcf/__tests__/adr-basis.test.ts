import { describe, expect, it } from "vitest";
import {
  convertFinancials,
  convertSecFundamentals,
  describeAdrBasis,
  detectAdrRatio,
  receiptShareCount,
  resolveAdrBasis,
  restateStaleRevenue,
} from "../adr-basis";
import type { CompanyFinancials } from "@/types/financials";
import type { SECFundamentals } from "@/lib/api/sec-edgar";

describe("detectAdrRatio", () => {
  it("reads Haleon's two shares per receipt from the filed and implied counts", () => {
    // 8,952.4M ordinary shares filed; $40.72B / $9.26 = 4,397.6M receipts.
    expect(detectAdrRatio(8952.4e6, 4397.6e6)).toBe(2);
  });
  it("reads one for an ordinary listing, and half for a receipt of half a share", () => {
    expect(detectAdrRatio(1e9, 1.02e9)).toBe(1);
    expect(detectAdrRatio(500e6, 1e9)).toBe(0.5);
  });
  it("refuses a quotient no depositary uses", () => {
    expect(detectAdrRatio(1.35e9, 1e9)).toBeNull();
    expect(detectAdrRatio(null, 1e9)).toBeNull();
  });
});

describe("resolveAdrBasis", () => {
  const base = { priceCurrency: "USD", financialCurrency: "GBP", fx: 1.34, filedShares: 8952.4e6, impliedShares: 4397.6e6 };
  it("establishes a basis for a foreign listing", () => {
    expect(resolveAdrBasis(base)).toEqual({ from: "GBP", to: "USD", fx: 1.34, ratio: 2 });
  });
  it("needs none in one currency, and gives none without a rate", () => {
    expect(resolveAdrBasis({ ...base, financialCurrency: "usd" })).toBeNull();
    expect(resolveAdrBasis({ ...base, fx: null })).toBeNull();
  });
  it("converts a direct listing in another currency at one share per unit, and says it assumed it (On)", () => {
    // On: francs, class A trading in dollars; the filed class A count 296.9M
    // against 334.2M implied fits no depositary ratio.
    const onon = resolveAdrBasis({ priceCurrency: "USD", financialCurrency: "CHF", fx: 1.24, filedShares: 296.87e6, impliedShares: 334.21e6 });
    expect(onon).toEqual({ from: "CHF", to: "USD", fx: 1.24, ratio: 1, ratioAssumed: true });
    expect(describeAdrBasis(onon!)).toMatch(/one share per unit is assumed/);
  });
});

describe("conversion", () => {
  const b = { from: "GBP", to: "USD", fx: 1.5, ratio: 2 };
  it("puts statements on the receipt's basis: money at the rate, counts over the ratio, per-share by both", () => {
    const fin = {
      ticker: "HLN",
      income_statement: { annual: [{ date: "2025-12-31", period: "FY2025", currency: "GBP", revenue: 100, eps_diluted: 0.2, shares_outstanding_diluted: 10 }], quarterly: [] },
      balance_sheet: { annual: [{ date: "2025-12-31", period: "FY2025", currency: "GBP", long_term_debt: 40, shares_outstanding: 10 }], quarterly: [] },
      cash_flow: { annual: [], quarterly: [] },
    } as unknown as CompanyFinancials;
    const out = convertFinancials(fin, b);
    const inc = out.income_statement.annual[0];
    expect(inc.revenue).toBe(150);
    expect(inc.eps_diluted).toBeCloseTo(0.6);
    expect(inc.shares_outstanding_diluted).toBe(5);
    expect(inc.currency).toBe("USD");
    expect(out.balance_sheet.annual[0].long_term_debt).toBe(60);
    expect(out.balance_sheet.annual[0].shares_outstanding).toBe(5);
    // Per-share value is preserved in the new units: revenue per share 10 → 30 (×1.5 ×2).
    expect(inc.revenue / inc.shares_outstanding_diluted).toBe(30);
  });

  it("converts the filings' facts the same way", () => {
    const fact = (value: number) => ({ value, form: "20-F", filed: "2026-03-01", periodEnd: "2025-12-31", concept: "x", durationDays: 0 });
    const sec = { cik: "1", dilutedShares: fact(10), financialDebt: fact(40), cash: null } as unknown as SECFundamentals;
    const out = convertSecFundamentals(sec, b);
    expect(out.dilutedShares?.value).toBe(5);
    expect(out.financialDebt?.value).toBe(60);
    expect(out.cash).toBeNull();
  });
});

describe("Haleon on the receipt's basis", () => {
  const hln = { from: "GBP", to: "USD", fx: 1.3255, ratio: 2 };

  it("restates a revenue base left in pounds and nothing else", () => {
    expect(restateStaleRevenue(11_030e6, [11_030e6, 11_233e6], hln)).toBeCloseTo(14_620e6, -7);
    // Already converted, or typed by the user: left alone.
    expect(restateStaleRevenue(14_620e6, [11_030e6, 11_233e6], hln)).toBeNull();
    expect(restateStaleRevenue(12_000e6, [11_030e6, 11_233e6], hln)).toBeNull();
  });

  it("puts Yahoo's ordinary share count on receipts", () => {
    const implied = 4_480e6;
    expect(receiptShareCount(8_952_353_648, implied, hln)).toBeCloseTo(4_476_176_824, 0);
    // A count already per receipt stays.
    expect(receiptShareCount(4_476e6, implied, hln)).toBe(4_476e6);
    expect(receiptShareCount(8_952e6, implied, null)).toBe(8_952e6);
  });
});
