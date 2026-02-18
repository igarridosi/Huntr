/**
 * Margin Calculations
 *
 * All margins return decimals (e.g. 0.42 = 42%).
 * Returns null if revenue is zero.
 */

/** Gross Margin = Gross Profit / Revenue */
export function calculateGrossMargin(
  gross_profit: number,
  revenue: number
): number | null {
  if (revenue === 0) return null;
  return gross_profit / revenue;
}

/** Operating Margin = Operating Income / Revenue */
export function calculateOperatingMargin(
  operating_income: number,
  revenue: number
): number | null {
  if (revenue === 0) return null;
  return operating_income / revenue;
}

/** Net Margin = Net Income / Revenue */
export function calculateNetMargin(
  net_income: number,
  revenue: number
): number | null {
  if (revenue === 0) return null;
  return net_income / revenue;
}

/** FCF Margin = Free Cash Flow / Revenue */
export function calculateFCFMargin(
  free_cash_flow: number,
  revenue: number
): number | null {
  if (revenue === 0) return null;
  return free_cash_flow / revenue;
}

/** CapEx to Revenue ratio = |Capital Expenditures| / Revenue */
export function calculateCapexToRevenue(
  capital_expenditures: number,
  revenue: number
): number | null {
  if (revenue === 0) return null;
  return Math.abs(capital_expenditures) / revenue;
}
