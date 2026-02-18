/**
 * FCF Yield — Free Cash Flow Yield
 *
 * FCF Yield = Free Cash Flow / Market Cap
 * Market Cap = Price × Shares Outstanding
 *
 * Returns a decimal (e.g. 0.04 = 4%).
 * Returns null if market cap is zero or negative.
 */
export function calculateFCFYield(
  free_cash_flow: number,
  price: number,
  shares_outstanding: number
): number | null {
  const marketCap = price * shares_outstanding;

  if (marketCap <= 0) return null;

  return free_cash_flow / marketCap;
}
