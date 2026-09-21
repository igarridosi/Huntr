import type { CashFlowStatement, CompanyFinancials } from "@/types/financials";

/**
 * Free cash flow, defined once.
 *
 *   FCF = cash from operations
 *       − purchases of property and equipment
 *       − additions of intangible assets
 *
 * Reference: YETI's FY2025 10-K (accession 0001670592-26-000013), whose
 * investing section lists "Purchases of property and equipment" (42,667)
 * and "Additions of intangibles, net" (59,172) as two lines, both
 * recurring every year (22.2M, 53.5M, 59.2M over three), with business
 * acquisitions on a third line that is not capex. Against 254,737 of
 * operating cash flow that is 152,898 of free cash flow — 8.2% of
 * revenue — not the 212,070 plant alone would give, nor the 164M that
 * mixing the two definitions across quarters produced.
 *
 * Which statement sources honour it:
 *   - Yahoo `capitalExpenditure` is plant plus intangibles, on annual and
 *     quarterly rows alike (YETI 2025: −101,839 = 42,667 + 59,172).
 *   - Alpha Vantage quarterly rows carry the same (investing outflow less
 *     business acquisitions).
 *   - Alpha Vantage annual rows do not: plant alone for some years, the
 *     whole investing outflow for others. A margin read from them is not
 *     verified against this definition.
 */
export interface FreeCashFlowParts {
  operatingCashFlow: number;
  purchasesOfPropertyAndEquipment: number;
  additionsOfIntangibles: number;
}

export function freeCashFlow(parts: FreeCashFlowParts): number {
  return parts.operatingCashFlow - Math.abs(parts.purchasesOfPropertyAndEquipment) - Math.abs(parts.additionsOfIntangibles);
}

/** Whether a statement row's capex field carries the definition above. */
export function capexIsDefined(row: { source?: string }, period: "annual" | "quarterly"): boolean {
  if (row.source === "yahoo") return true;
  if (row.source === "alphavantage") return period === "quarterly";
  return false;
}

/** Free cash flow from a statement row — operations less the capex the row carries — with whether that capex is the defined one. */
export function statementFreeCashFlow(row: CashFlowStatement, period: "annual" | "quarterly"): { value: number; defined: boolean } {
  return { value: row.operating_cash_flow - Math.abs(row.capital_expenditures), defined: capexIsDefined(row, period) };
}

/**
 * The financials the model reads, with cash flow on the defined basis
 * wherever a source that honours it exists.
 *
 * Alpha Vantage's bundle brings twenty years of income statements and
 * balance sheets; its annual cash-flow rows change what "capex" means
 * from one year to the next. Yahoo's four annual rows are consistent.
 * So the annual cash flow is Yahoo's where it has the year, Alpha
 * Vantage's only for years before Yahoo's first (kept for the chart's
 * history, flagged by `source`), and the quarterly rows are whichever
 * source has more of them.
 */
export function withDefinedCashFlow(primary: CompanyFinancials, yahoo: CompanyFinancials | null | undefined): CompanyFinancials {
  const yAnnual = yahoo?.cash_flow?.annual ?? [];
  if (yAnnual.length === 0) return primary;
  const firstYahoo = [...yAnnual].map((r) => r.date).sort()[0];
  const older = (primary.cash_flow?.annual ?? []).filter((r) => r.date < firstYahoo);
  const annual = [...older, ...yAnnual].sort((a, b) => a.date.localeCompare(b.date));
  const pq = primary.cash_flow?.quarterly ?? [];
  const yq = yahoo?.cash_flow?.quarterly ?? [];
  return { ...primary, cash_flow: { annual, quarterly: pq.length >= yq.length ? pq : yq } };
}
