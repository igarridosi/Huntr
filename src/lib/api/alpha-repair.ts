import type { CashFlowStatement, CompanyFinancials } from "@/types/financials";

/**
 * Puts a cached Alpha Vantage bundle on the same footing as a fresh one.
 * Bundles written before the capex sign was fixed carry a positive capex
 * and a free cash flow that *added* it — the DCF, the screener's FCF
 * yield and every chart read cash from operations plus capex as "free".
 * Recomputing on read repairs them without spending a call; on a bundle
 * mapped after the fix it changes nothing.
 */
export function repairAlphaFinancials<T extends CompanyFinancials | null | undefined>(fin: T): T {
  if (!fin?.cash_flow) return fin;
  const fix = (rows: CashFlowStatement[] | undefined) =>
    (rows ?? []).map((r) => {
      const capex = -Math.abs(r.capital_expenditures ?? 0) || 0;
      const fcf = (r.operating_cash_flow ?? 0) + capex;
      return r.capital_expenditures === capex && r.free_cash_flow === fcf ? r : { ...r, capital_expenditures: capex, free_cash_flow: fcf };
    });
  return { ...fin, cash_flow: { annual: fix(fin.cash_flow.annual), quarterly: fix(fin.cash_flow.quarterly) } };
}
