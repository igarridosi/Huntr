/**
 * ROIC — Return on Invested Capital
 *
 * ROIC = NOPAT / Invested Capital
 * NOPAT = Operating Income × (1 - Effective Tax Rate)
 * Invested Capital = Total Equity + Long-Term Debt - Cash & Equivalents
 *
 * Returns a decimal (e.g. 0.25 = 25%).
 * Returns null if invested capital <= 0 (meaningless ratio).
 */
export function calculateROIC(params: {
  operating_income: number;
  income_tax: number;
  pre_tax_income: number;
  total_equity: number;
  long_term_debt: number;
  cash_and_equivalents: number;
}): number | null {
  const {
    operating_income,
    income_tax,
    pre_tax_income,
    total_equity,
    long_term_debt,
    cash_and_equivalents,
  } = params;

  // Guard: avoid division by zero on pre_tax_income
  if (pre_tax_income === 0) return null;

  const effectiveTaxRate = Math.max(0, income_tax / pre_tax_income);
  const nopat = operating_income * (1 - effectiveTaxRate);

  const investedCapital = total_equity + long_term_debt - cash_and_equivalents;

  // Guard: meaningless if invested capital is zero or negative
  if (investedCapital <= 0) return null;

  return nopat / investedCapital;
}
