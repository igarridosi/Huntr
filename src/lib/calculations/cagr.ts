/**
 * CAGR — Compound Annual Growth Rate
 *
 * CAGR = (End Value / Start Value)^(1/years) - 1
 *
 * @param values  Array of numbers ordered oldest → newest (chronological).
 * @param years   Window size: 3, 5, or 10.
 *
 * Returns a decimal (e.g. 0.12 = 12%).
 * Returns null if insufficient data or invalid values (start ≤ 0).
 */
export function calculateCAGR(
  values: number[],
  years: 3 | 5 | 10
): number | null {
  // Need at least (years + 1) data points
  if (values.length < years + 1) return null;

  const endValue = values[values.length - 1];
  const startValue = values[values.length - 1 - years];

  // Guard: start value must be positive for meaningful calculation
  if (startValue <= 0) return null;

  // Guard: if end value is negative, CAGR is meaningless
  if (endValue <= 0) return null;

  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * Compute CAGR for all available windows (3Y, 5Y, 10Y).
 *
 * @param values  Array of numbers ordered oldest → newest.
 * @returns Object with CAGR values for each window, or null if insufficient data.
 */
export function calculateAllCAGRs(
  values: number[]
): { cagr3Y: number | null; cagr5Y: number | null; cagr10Y: number | null } {
  return {
    cagr3Y: calculateCAGR(values, 3),
    cagr5Y: calculateCAGR(values, 5),
    cagr10Y: calculateCAGR(values, 10),
  };
}
