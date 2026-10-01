/**
 * Synthetic price series for the landing's illustrations, shaped like real
 * ones. A Gaussian random walk with constant step size draws a line that is
 * too even: real prices compound (log returns), their volatility comes in
 * clusters (calm stretches, then a burst of large moves), and large moves
 * are more frequent than a normal distribution allows. This uses all three:
 * GARCH(1,1) variance and Student-t shocks on daily log returns.
 *
 * Everything is seeded, so the server and the client draw the same lines.
 */

const TRADING_DAYS = 252;

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number) {
  // Box–Muller; 1 - random() keeps the logarithm away from zero.
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

/** Student-t with `nu` degrees of freedom, scaled to unit variance. */
function studentT(random: () => number, nu: number) {
  let chi = 0;
  for (let i = 0; i < nu; i += 1) chi += normal(random) ** 2;
  return (normal(random) / Math.sqrt(chi / nu)) * Math.sqrt((nu - 2) / nu);
}

/**
 * Daily log returns: GARCH(1,1) volatility around `annualVol`, t-distributed
 * shocks, drift from `annualReturn`.
 */
export function dailyReturns(seed: number, days: number, annualReturn: number, annualVol: number) {
  const random = mulberry32(seed);
  const longRunVar = (annualVol * annualVol) / TRADING_DAYS;
  const alpha = 0.09;
  const beta = 0.89;
  const omega = longRunVar * (1 - alpha - beta);
  const drift = Math.log(1 + annualReturn) / TRADING_DAYS;

  const returns: number[] = [];
  let variance = longRunVar;
  let shock = 0;
  for (let i = 0; i < days; i += 1) {
    variance = omega + alpha * shock * shock + beta * variance;
    shock = Math.sqrt(variance) * studentT(random, 4);
    returns.push(drift - variance / 2 + shock);
  }
  return returns;
}

/** Prices from log returns, starting at `start`. */
export function toPrices(returns: number[], start = 100) {
  const prices = [start];
  for (const r of returns) prices.push(prices[prices.length - 1] * Math.exp(r));
  return prices;
}

/**
 * Bends a price path so it ends `totalReturn` above where it started, without
 * flattening it: a straight line is added in log space (a Brownian bridge),
 * so every wiggle keeps its size.
 */
export function pinTotalReturn(prices: number[], totalReturn: number) {
  const last = prices.length - 1;
  const start = prices[0];
  const actual = Math.log(prices[last] / start);
  const wanted = Math.log(1 + totalReturn);
  return prices.map((p, i) => p * Math.exp(((wanted - actual) * i) / last));
}

/** A price series for one name: `days` sessions at its own drift and volatility. */
export function priceSeries(seed: number, days: number, annualReturn: number, annualVol: number) {
  return toPrices(dailyReturns(seed, days, annualReturn, annualVol));
}
