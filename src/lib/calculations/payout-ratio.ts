/**
 * Payout Ratio
 *
 * Payout Ratio = |Dividends Paid| / Net Income
 *
 * Note: dividends_paid from cash flow is typically negative.
 * We take the absolute value to get a positive ratio.
 *
 * Returns a decimal (e.g. 0.60 = 60%).
 * Returns 0 if no dividends paid.
 * Returns null if net income is zero or negative (meaningless ratio).
 */
export function calculatePayoutRatio(
  dividends_paid: number,
  net_income: number
): number | null {
  // No dividends
  if (dividends_paid === 0) return 0;

  // Guard: can't compute meaningful payout ratio with zero/negative net income
  if (net_income <= 0) return null;

  return Math.abs(dividends_paid) / net_income;
}
