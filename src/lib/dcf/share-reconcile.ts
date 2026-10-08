/**
 * Whether a share count squares with the market capitalisation.
 *
 * A leaf module on purpose: the gate, the sourced fields and the SEC client
 * all read it, and a constant read at module load through that cycle was
 * undefined in the browser bundle.
 */

/** How far price × shares may sit from the reported market cap either way. */
export const MARKET_CAP_TOLERANCE = 0.03;

/**
 * How far a diluted count may sit above the market cap's own count.
 *
 * The reported market cap is basic shares times price; the model divides by
 * the diluted count, which adds options, restricted units and convertibles.
 * That gap is the dilution, not an error: Reddit's 202.0M against 192.4M
 * (5.0%) and Instacart's 248.9M against 237.3M (4.9%) failed a 1% check
 * every time they were loaded. The allowance only runs one way. A diluted
 * count below the basic one is a missing class or a stale filing - Visa's
 * class A alone was 9% short, Lululemon's tag 6%, On's 11% - and still fails.
 */
export const DILUTION_ALLOWANCE = 0.08;

/** Whether a deviation (filed / implied − 1) reconciles, given whether the filed count is diluted. */
export function shareCountReconciles(deviation: number, diluted: boolean, tolerance: number = MARKET_CAP_TOLERANCE): boolean {
  const ceiling = diluted ? Math.max(tolerance, DILUTION_ALLOWANCE) : tolerance;
  return deviation >= -tolerance && deviation <= ceiling;
}
