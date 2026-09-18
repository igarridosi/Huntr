import { describe, expect, it } from "vitest";
import { looksLikeLender } from "../business-model";

const balance = (assets: number, current: number, equity: number) => ({ total_assets: assets, total_current_assets: current, total_equity: equity });

describe("looksLikeLender", () => {
  it("does not take a sector label's word for it: S&P Global files under Financial Services with a classified balance sheet and half its assets in equity", () => {
    expect(looksLikeLender({ industry: "Financial Data & Stock Exchanges", balance: balance(60_000, 4_500, 30_600) })).toBe(false);
    // Visa: "Credit Services", classified, 40% equity.
    expect(looksLikeLender({ industry: "Credit Services", balance: balance(94_500, 33_000, 38_700) })).toBe(false);
  });

  it("reads a lender off its balance sheet: no current-asset split and thin equity", () => {
    // SoFi: "Credit Services" too, but an unclassified bank balance sheet with 21% equity.
    expect(looksLikeLender({ industry: "Credit Services", balance: balance(30_000, 0, 6_300) })).toBe(true);
    expect(looksLikeLender({ industry: "Banks - Diversified", balance: balance(4_000_000, 0, 330_000) })).toBe(true);
  });

  it("reads a lender off its income statement when the balance sheet is classified: American Express funds card loans and pays a tenth of revenue in interest", () => {
    expect(looksLikeLender({ industry: "Credit Services", balance: balance(271_000, 43_000, 30_000), income: { revenue: 61_000, interest_expense: 6_200 } })).toBe(true);
    // Mastercard: 14% equity from buybacks, 2% interest — a network, not a lender.
    expect(looksLikeLender({ industry: "Credit Services", balance: balance(48_000, 20_000, 6_500), income: { revenue: 28_000, interest_expense: 620 } })).toBe(false);
  });

  it("takes an industry that names banking, insurance or lending on its own", () => {
    expect(looksLikeLender({ industry: "Insurance - Property & Casualty", balance: null })).toBe(true);
    expect(looksLikeLender({ industry: "Mortgage Finance" })).toBe(true);
    expect(looksLikeLender({ industry: "Software - Application", balance: null })).toBe(false);
  });

  it("needs thin equity and a second signal: a leveraged utility is not a lender, nor is an unclassified holding with fat equity", () => {
    // Vistra: 12% equity, classified, interest 5.5% of revenue.
    expect(looksLikeLender({ industry: "Utilities - Independent Power Producers", balance: balance(37_000, 9_000, 4_500), income: { revenue: 17_000, interest_expense: 940 } })).toBe(false);
    expect(looksLikeLender({ industry: "Conglomerates", balance: balance(1_000, 0, 700) })).toBe(false);
  });
});
