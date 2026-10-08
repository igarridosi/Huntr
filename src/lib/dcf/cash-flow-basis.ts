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

/**
 * An effective rate below this is a quirk of the year, not a tax rate: On's
 * statements gave 0.7%, which returned its interest to the flows untaxed.
 * The statutory rate stands in, and says so.
 */
export const MIN_EFFECTIVE_TAX_RATE = 0.05;

function effectiveTaxRate(income: IncomeStatement): { rate: number; source: "effective" | "statutory" } {
  const effective = income.pre_tax_income > 0 && income.income_tax >= 0 ? income.income_tax / income.pre_tax_income : NaN;
  const usable = Number.isFinite(effective) && effective >= MIN_EFFECTIVE_TAX_RATE && effective <= 0.4;
  return usable ? { rate: effective, source: "effective" } : { rate: STATUTORY_TAX_RATE, source: "statutory" };
}

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
  const { rate: taxRate, source } = effectiveTaxRate(income);
  return {
    marginPoints: (interest * (1 - taxRate)) / income.revenue,
    interestExpense: interest,
    taxRate,
    taxRateSource: source,
    periodEnd: income.date,
  };
}

/**
 * The interest add-back that belongs to debt, for an IFRS filer.
 *
 * Under IFRS 16 the interest on lease liabilities sits in interest expense.
 * The model takes the lease principal out of free cash flow and does not
 * subtract the liability as debt, so adding that interest back would return
 * part of the rent: On, with no financial debt, had 0.72 points of lease
 * interest added back as if it were a cost of borrowing. With no financial
 * debt, none of the interest is a cost of borrowing. With some, the
 * interest cannot be split from the filings, so it is kept whole - an
 * overstatement of at most the lease interest, named here.
 */
export function debtInterestPoints(points: number, params: { ifrsLeases: boolean; financialDebt: number }): number {
  if (params.ifrsLeases && !(params.financialDebt > 0)) return 0;
  return points;
}

/**
 * After-tax interest income over revenue: what a company with cash in the
 * bank earns on it, sitting inside its reported free cash flow.
 *
 * On the unlevered basis the model adds the cash to equity value at the
 * end. Leaving the interest it earns in the flows as well counts the same
 * cash twice: Reddit's $2.8B earned roughly $100M a year, about 3.5
 * points of margin, discounted forever on top of the $2.8B itself.
 */
export function interestIncomeStrip(income: IncomeStatement | null | undefined): number {
  if (!income || !(income.revenue > 0)) return 0;
  const interestIncome = Math.max(0, income.interest_income ?? 0);
  if (interestIncome === 0) return 0;
  return (interestIncome * (1 - effectiveTaxRate(income).rate)) / income.revenue;
}

/** Every adjustment between the margin as reported and the margin the engine discounts, in margin points. */
export interface MarginAdjustments {
  /** After-tax interest expense, added back on the unlevered basis. */
  interestPoints?: number;
  /** After-tax interest income, taken out on the unlevered basis because the cash is added separately. */
  interestIncomePoints?: number;
  /** Stock-based compensation over revenue, deducted on either basis. */
  sbcPoints?: number;
  /**
   * Lease principal over revenue, for an IFRS filer. IFRS 16 puts it in
   * financing, so operating cash flow is struck before the rent a US GAAP
   * filer has already paid out of it. Deducted on either basis: it is the
   * cost of the stores and offices, not of the capital structure.
   */
  leasePrincipalPoints?: number;
}

/**
 * The points the engine adds to both margins, for a basis.
 *
 * Levered flows keep their interest, both paid and earned, because net debt
 * is not subtracted; stock compensation is a cost on either basis.
 */
export function marginAdjustment(basis: CashFlowBasis, adjustments: MarginAdjustments = {}): number {
  const operating = Math.max(0, adjustments.sbcPoints ?? 0) + Math.max(0, adjustments.leasePrincipalPoints ?? 0);
  if (basis === "levered") return operating > 0 ? -operating : 0;
  return Math.max(0, adjustments.interestPoints ?? 0) - Math.max(0, adjustments.interestIncomePoints ?? 0) - operating;
}

/**
 * The inputs the engine runs on for a basis.
 *
 * The margins on screen are free cash flow as reported: levered (after
 * interest) and before stock compensation. Every adjustment between that
 * and what the model discounts is applied here, to both margins of every
 * scenario, never written onto the sliders. Writing them onto the sliders
 * is what broke twice: Haleon's interest add-back was added once at
 * populate, so a margin typed afterwards reached the engine without it;
 * the SBC switch subtracted once at the click, so Instacart's Base and
 * Bull, typed after the click, ran with no deduction at all while its Bear
 * carried one.
 *
 * Levered flows go in without net debt to subtract.
 */
export function engineInputsFor<T extends { totalDebt: number; cashAndEquivalents: number; baseFCFMargin: number; terminalFCFMargin: number }>(
  inputs: T,
  basis: CashFlowBasis,
  adjustments: number | MarginAdjustments = 0
): T {
  const shift = marginAdjustment(basis, typeof adjustments === "number" ? { interestPoints: adjustments } : adjustments);
  const balance = basis === "levered" ? { totalDebt: 0, cashAndEquivalents: 0 } : null;
  if (shift === 0) return balance ? { ...inputs, ...balance } : inputs;
  return {
    ...inputs,
    ...balance,
    baseFCFMargin: inputs.baseFCFMargin + shift,
    terminalFCFMargin: inputs.terminalFCFMargin + shift,
  };
}
