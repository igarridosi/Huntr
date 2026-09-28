import type { IncomeStatement } from "@/types/financials";

/**
 * Levered or unlevered, said explicitly.
 *
 * Cash from operations is struck after interest: the free cash flow a
 * statement gives is levered. The two-stage model subtracts net debt
 * from the discounted flows to reach equity — which is only right for
 * unlevered flows, with interest added back after tax. Feeding it
 * levered flows and subtracting net debt charges the debt twice: once
 * through the interest already out of the flows, once as a deduction.
 * That is what FIS's valuation did, and the difference was $47 against
 * $56 a share.
 *
 * So the basis is a switch, not an assumption in someone's head:
 *
 *  - unlevered (default): after-tax interest added back to the margin,
 *    net debt subtracted;
 *  - levered: the margin as reported, and net debt NOT subtracted — the
 *    engine runs with debt and cash at zero, so the pairing that cannot
 *    be right cannot be selected.
 */
export type CashFlowBasis = "unlevered" | "levered";

/** The statutory rate used only when the statements give no effective one; named so the export can say so. */
export const STATUTORY_TAX_RATE = 0.21;

export interface InterestAddBack {
  /** After-tax interest over revenue: what unlevering adds to the margin. */
  marginPoints: number;
  interestExpense: number;
  taxRate: number;
  /** "effective" when read off the income statement, "statutory" when it could not be. */
  taxRateSource: "effective" | "statutory";
  periodEnd: string;
}

/**
 * The add-back for the latest annual income statement: interest expense
 * times one minus the effective tax rate, over revenue. The effective
 * rate is income tax over pre-tax income when both are positive and it
 * lands between 0 and 40%; otherwise the statutory rate stands in and
 * says so.
 */
export function interestAddBack(income: IncomeStatement | null | undefined): InterestAddBack | null {
  if (!income || !(income.revenue > 0)) return null;
  const interest = Math.abs(income.interest_expense || 0);
  const effective = income.pre_tax_income > 0 && income.income_tax >= 0 ? income.income_tax / income.pre_tax_income : NaN;
  const usable = Number.isFinite(effective) && effective >= 0 && effective <= 0.4;
  const taxRate = usable ? effective : STATUTORY_TAX_RATE;
  return {
    marginPoints: (interest * (1 - taxRate)) / income.revenue,
    interestExpense: interest,
    taxRate,
    taxRateSource: usable ? "effective" : "statutory",
    periodEnd: income.date,
  };
}

/**
 * The inputs the engine runs on for a basis.
 *
 * The margins on screen are free cash flow as reported, which is levered
 * (after interest). Levered flows go in without net debt to subtract;
 * unlevered ones keep net debt and get the after-tax interest back on both
 * margins here, not on the sliders. It used to be added once, at populate,
 * so a margin typed by hand afterwards - Haleon's 20.26% - reached the
 * engine without the 2.46 points while net debt was still subtracted.
 */
export function engineInputsFor<T extends { totalDebt: number; cashAndEquivalents: number; baseFCFMargin: number; terminalFCFMargin: number }>(
  inputs: T,
  basis: CashFlowBasis,
  interestPoints = 0
): T {
  if (basis === "levered") return { ...inputs, totalDebt: 0, cashAndEquivalents: 0 };
  if (!(interestPoints > 0)) return inputs;
  return { ...inputs, baseFCFMargin: inputs.baseFCFMargin + interestPoints, terminalFCFMargin: inputs.terminalFCFMargin + interestPoints };
}
