/**
 * DCF — valuing a foreign listing (an ADR) against its own price.
 *
 * Haleon reports in pounds per ordinary share; its NYSE receipt trades in
 * dollars and stands for two ordinary shares. A value per share built from
 * the accounts is a value in pounds per ordinary share, and comparing it
 * with a dollar price per receipt is wrong twice. The guard refused to
 * answer rather than answer wrongly.
 *
 * This puts the statements on the receipt's basis before the model sees
 * them: every amount of money at today's exchange rate, every share count
 * divided by the ratio, every per-share figure multiplied by both. The
 * model, its checks and its output are then all in dollars per receipt,
 * and none of it needs to know an ADR exists.
 *
 * The ratio is not guessed: the filed count over the count the market cap
 * implies at today's price has to land within a few percent of a ratio
 * depositary banks actually use. Anything else is left to the guard.
 */

import type { CompanyFinancials } from "@/types/financials";
import type { SECFact, SECFundamentals } from "@/lib/api/sec-edgar";

export interface AdrBasis {
  /** Currency the statements report in. */
  from: string;
  /** Currency the listing trades in. */
  to: string;
  /** Units of `to` per unit of `from`. */
  fx: number;
  /** Ordinary shares per receipt: 2 for Haleon, 0.5 when a receipt is half a share. */
  ratio: number;
  /**
   * True when no depositary ratio fit the share count and one share per
   * unit was assumed. A foreign company listed directly - On, Swiss, filing
   * in francs, its class A shares trading in dollars on the NYSE - has no
   * receipt and no ratio; its filed count can still miss the market's by a
   * class (On's class B), which the share-count check reports on its own.
   */
  ratioAssumed?: boolean;
}

/** Ratios depositary banks use. */
const RATIOS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 10];
/** How far the filed-over-implied quotient may sit from one of them (a quarter of buybacks, a stale filing). */
const RATIO_TOLERANCE = 0.08;

/**
 * The ratio a filed count and a market-implied count agree on, or null.
 * `filed` counts ordinary shares; `implied` is market cap over price, so it
 * counts whatever trades — receipts, for an ADR.
 */
export function detectAdrRatio(filed: number | null | undefined, implied: number | null | undefined): number | null {
  if (!filed || !implied || !(filed > 0) || !(implied > 0)) return null;
  const q = filed / implied;
  let best: number | null = null;
  let bestGap = Infinity;
  for (const r of RATIOS) {
    const gap = Math.abs(q / r - 1);
    if (gap < bestGap) {
      bestGap = gap;
      best = r;
    }
  }
  return bestGap <= RATIO_TOLERANCE ? best : null;
}

/**
 * The basis for a listing, or null when none is needed (one currency, one
 * share per unit) or none can be established (no rate, no ratio that fits).
 */
export function resolveAdrBasis(params: {
  priceCurrency: string | null | undefined;
  financialCurrency: string | null | undefined;
  fx: number | null | undefined;
  filedShares: number | null | undefined;
  impliedShares: number | null | undefined;
}): AdrBasis | null {
  const to = params.priceCurrency?.trim().toUpperCase() || null;
  const from = params.financialCurrency?.trim().toUpperCase() || null;
  if (!to || !from || from === to) return null;
  if (!params.fx || !(params.fx > 0)) return null;
  // The count is converted first: the filed count is in ordinary shares, the
  // implied one in receipts, whatever the currencies.
  const ratio = detectAdrRatio(params.filedShares, params.impliedShares);
  // No ratio fits: a direct listing in another currency, or a count that
  // misses a class. The money is converted all the same - refusing left On
  // with no valuation at all, while its reverse DCF ran in francs against a
  // dollar price - and the count is left to the share-count check.
  if (ratio === null) return { from, to, fx: params.fx, ratio: 1, ratioAssumed: true };
  return { from, to, fx: params.fx, ratio };
}

const SHARE_FIELDS = new Set(["shares_outstanding", "shares_outstanding_basic", "shares_outstanding_diluted"]);
const PER_SHARE_FIELDS = new Set(["eps_basic", "eps_diluted", "dividend_per_share", "book_value_per_share"]);
const NOT_MONEY = new Set(["date", "period", "currency", "source", "fiscal_year", "fiscal_quarter"]);

function convertRow<T extends object>(row: T, b: AdrBasis): T {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== "number" || !Number.isFinite(value) || NOT_MONEY.has(key)) continue;
    if (SHARE_FIELDS.has(key)) out[key] = value / b.ratio;
    else if (PER_SHARE_FIELDS.has(key)) out[key] = value * b.ratio * b.fx;
    // Ratios and percentages the statements carry are unit-free.
    else if (/(_ratio|_margin|_pct|_percent|_rate)$/.test(key)) continue;
    else out[key] = value * b.fx;
  }
  if ("currency" in out) out.currency = b.to;
  return out as T;
}

/** Statements on the receipt's basis. */
export function convertFinancials(fin: CompanyFinancials, b: AdrBasis): CompanyFinancials {
  const block = <R extends object>(s: { annual: R[]; quarterly: R[] } | undefined) =>
    s ? { annual: s.annual.map((r) => convertRow(r, b)), quarterly: s.quarterly.map((r) => convertRow(r, b)) } : s;
  return {
    ...fin,
    income_statement: block(fin.income_statement) ?? fin.income_statement,
    balance_sheet: block(fin.balance_sheet) ?? fin.balance_sheet,
    cash_flow: block(fin.cash_flow) ?? fin.cash_flow,
  };
}

const SEC_SHARE_FACTS = new Set(["dilutedShares", "coverShares", "weightedDilutedShares"]);

/** The filings' facts on the receipt's basis: counts over the ratio, money at the rate. */
export function convertSecFundamentals(sec: SECFundamentals, b: AdrBasis): SECFundamentals {
  const out: Record<string, unknown> = { ...sec };
  for (const [key, value] of Object.entries(sec)) {
    if (!value || typeof value !== "object" || typeof (value as SECFact).value !== "number") continue;
    const fact = value as SECFact;
    out[key] = { ...fact, value: SEC_SHARE_FACTS.has(key) ? fact.value / b.ratio : fact.value * b.fx };
  }
  return out as unknown as SECFundamentals;
}

/** "Converted from GBP at 1.34 USD/GBP; 1 ADR = 2 ordinary shares." */
export function describeAdrBasis(b: AdrBasis): string {
  if (b.ratioAssumed) {
    return `Statements converted from ${b.from} at ${b.fx.toFixed(4)} ${b.to}/${b.from}. No depositary ratio fits the share count, so one share per unit is assumed: if the filed count misses a share class, switch to the count the market cap implies.`;
  }
  const ratio =
    b.ratio === 1
      ? "one share per unit"
      : b.ratio >= 1
        ? `1 ADR = ${b.ratio} ordinary shares`
        : `1 ADR = 1/${Math.round(1 / b.ratio)} of an ordinary share`;
  return `Statements converted from ${b.from} at ${b.fx.toFixed(4)} ${b.to}/${b.from}; ${ratio}.`;
}

/**
 * A revenue base still in the statements' currency, restated; null when it
 * is not one. A base is written once (populate, a saved scenario, a basis
 * choice) and can predate the rate: Haleon's £11.03bn stayed in pounds next
 * to a balance sheet already in dollars. It is recognised by matching one of
 * the unconverted bases within half a percent; anything else the user typed.
 */
export function restateStaleRevenue(value: number, rawBases: number[], b: AdrBasis): number | null {
  if (!(value > 0) || Math.abs(b.fx - 1) < 0.01) return null;
  const stale = rawBases.some((raw) => raw > 0 && Math.abs(value / raw - 1) <= 0.005);
  return stale ? value * b.fx : null;
}

/**
 * A share count Yahoo reports in ordinary shares, on the receipt's basis.
 * Yahoo's count for Haleon is the 8.95bn ordinary shares; the price is per
 * receipt of two. Only divided when the count itself lands on the ratio
 * against the market-implied count, so a count already per receipt stays.
 */
export function receiptShareCount(shares: number | null | undefined, implied: number | null | undefined, b: AdrBasis | null): number | null {
  if (!shares || !(shares > 0)) return shares ?? null;
  if (!b || b.ratio === 1) return shares;
  return detectAdrRatio(shares, implied) === b.ratio ? shares / b.ratio : shares;
}
