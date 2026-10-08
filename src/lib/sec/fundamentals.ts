/**
 * SEC EDGAR — every figure the app takes from the filings, for one company.
 *
 * Where the facts come from is a parameter: the app reads them live from
 * EDGAR today, and from the rows the ingest pipeline stores next. The
 * choice among them is made here, once, for both.
 */

import { OPERATING_CASH_FLOW_CONCEPTS, SEC_CONCEPTS, type SECTaxonomy } from "./concepts";
import { extractFactRows, pickFresher, selectLatestFact, sumFacts, type FactPeriod, type SECFact } from "./facts";
import { composeRevenueTtm, type SECRevenueTtm } from "./revenue-ttm";

/** Every fact a company has filed, by taxonomy then concept, as companyfacts carries it. */
export type CompanyFacts = Record<string, Record<string, unknown>>;

/** Where the facts come from. */
export interface FactsSource {
  /** The companyfacts `facts` object, or null when the company is not there. */
  companyFacts(cik: string): Promise<CompanyFacts | null>;
  /** One concept on its own (the companyconcept payload), for when companyfacts had nothing. */
  concept(cik: string, taxonomy: SECTaxonomy, concept: string): Promise<unknown | null>;
  /** The as-converted diluted count of a multi-class issuer, read from its latest filing. */
  classDilutedShares(cik: string): Promise<SECFact | null>;
}

/**
 * Resolves a figure from a cascade of tags, preferring the freshest.
 *
 * The obvious implementation - take the first tag that returns anything -
 * is wrong, and wrong in a way that looks fine. Companies change which tag
 * they file under: Starbucks last used
 * CashAndCashEquivalentsAtCarryingValue in 2022 and Ford last used
 * LongTermDebtNoncurrent in 2021. Stopping at the first hit returns those
 * abandoned tags and prints a four-year-old balance next to a current one, as
 * though both described the same company today.
 *
 * So every tag in the cascade is fetched and the one with the most recent
 * period end wins. Order still matters as a tie-break - the first tag is the
 * preferred definition - but recency comes first, because a stale figure is
 * not a worse answer, it is a different company.
 */
export async function fetchConcept(
  source: FactsSource,
  cik: string,
  concepts: readonly string[],
  period: FactPeriod = "any",
  taxonomy: SECTaxonomy = "us-gaap"
): Promise<SECFact | null> {
  const allFacts = await source.companyFacts(cik);
  const scope = allFacts?.[taxonomy];

  const candidates: SECFact[] = [];
  for (const concept of concepts) {
    const entry = scope?.[concept];
    const fact = entry
      ? selectLatestFact(extractFactRows(entry), period, concept)
      : null;
    if (fact) candidates.push(fact);
  }

  // Only fall back to the per-tag endpoint when the bulk file gave nothing at
  // all, so a company missing from companyfacts is still reachable.
  if (candidates.length === 0 && !allFacts) {
    for (const concept of concepts) {
      const payload = await source.concept(cik, taxonomy, concept);
      if (!payload) continue;
      const fact = selectLatestFact(extractFactRows(payload), period, concept);
      if (fact) candidates.push(fact);
    }
  }

  if (candidates.length === 0) return null;

  return candidates.reduce((winner, candidate) => {
    const byPeriod = candidate.periodEnd.localeCompare(winner.periodEnd);
    if (byPeriod !== 0) return byPeriod > 0 ? candidate : winner;
    // Same period: keep the earlier tag in the cascade, which is the
    // preferred definition.
    return winner;
  });
}

export interface SECFundamentals {
  cik: string;
  /** The preferred count before the market cap has had its say. */
  dilutedShares: SECFact | null;
  /**
   * Both candidates, kept so the cross-check can choose rather than complain.
   *
   * The cover-page count is right far more often, but on a multi-class issuer
   * the tag carries one class: LULU files 108.4M against a share base of
   * 113.6M, and the model then divided equity value by a denominator 4.5% too
   * small. Keeping both lets `selectShareCount` pick whichever reconciles.
   */
  coverShares: SECFact | null;
  weightedDilutedShares: SECFact | null;
  financialDebt: SECFact | null;
  cash: SECFact | null;
  operatingLeases: SECFact | null;
  /** Rent charged through the income statement. Needed to undo the double
   *  count when leases are also treated as debt. */
  operatingLeaseExpense: SECFact | null;
  shareBasedCompensation: SECFact | null;
  /** Trailing twelve months of revenue from the filings, for verifying the model's base. */
  revenueTtm?: SECRevenueTtm | null;
  /** Operating cash flow of the last fiscal year, from the 10-K, for verifying the margin's numerator. */
  operatingCashFlowAnnual?: SECFact | null;
  /** The latest business acquisition and disposal on file, whatever their age; the reader of the regime decides if they are recent. */
  acquisitions?: SECFact | null;
  divestitures?: SECFact | null;
  /** Redeemable preferred and other temporary equity: a claim ahead of the common shareholder. */
  redeemablePreferred?: SECFact | null;
  /** Shares the latest quarter's diluted count adds for preferred conversion; positive means the preferred is in the count. */
  preferredConversionShares?: SECFact | null;
}

/**
 * Total borrowings, resolved without ever letting a half stand for the whole.
 *
 * Three rules, each of which existed because breaking it produced a plausible
 * wrong number:
 *
 *  - The two halves are only added when they describe the same period end.
 *    Summing a June non-current balance with a March current one is arithmetic
 *    on two different companies.
 *  - A lone half is never returned as a total while a combined tag exists. If
 *    it is all there is, it comes back marked partial so the interface can say
 *    the figure understates rather than presenting it as complete.
 *  - The combined tags are alternatives to the pair, never additions to it.
 *    Adding them would count the current portion twice.
 */
export async function resolveFinancialDebt(source: FactsSource, cik: string): Promise<SECFact | null> {
  const [noncurrent, current, combined, shortTerm] = await Promise.all([
    fetchConcept(source, cik, SEC_CONCEPTS.debtNoncurrent),
    fetchConcept(source, cik, SEC_CONCEPTS.debtCurrent),
    fetchConcept(source, cik, SEC_CONCEPTS.debtTotalIncludingCurrent),
    fetchConcept(source, cik, SEC_CONCEPTS.debtShortTerm),
  ]);
  return composeFinancialDebt({ noncurrent, current, combined, shortTerm });
}

/**
 * Total borrowings from the parts the issuer files: the long-term debt,
 * its current portion, and the short-term borrowings that were never
 * long-term. A combined tag stands in for the first two only. Short-term
 * borrowings are added only when they describe the same balance-sheet
 * date, and never on top of a `DebtCurrent` figure, which already holds
 * them.
 */
export function composeFinancialDebt(parts: {
  noncurrent: SECFact | null;
  current: SECFact | null;
  combined: SECFact | null;
  shortTerm: SECFact | null;
}): SECFact | null {
  const { noncurrent, current, combined, shortTerm } = parts;

  const samePeriod = noncurrent && current && noncurrent.periodEnd === current.periodEnd;
  let core: SECFact | null;
  let currentHoldsShortTerm = false;
  if (samePeriod) {
    const paired = sumFacts(noncurrent, current) as SECFact;
    // A combined tag only wins if it describes a later period than the pair.
    core = combined && combined.periodEnd > paired.periodEnd ? combined : paired;
    currentHoldsShortTerm = core === paired && current!.concept === "DebtCurrent";
  } else if (combined) {
    core = combined;
  } else {
    const lone = pickFresher(noncurrent, current);
    if (!lone) return null;
    core = { ...lone, partial: true };
    currentHoldsShortTerm = lone.concept === "DebtCurrent";
  }

  if (shortTerm && shortTerm.value > 0 && !currentHoldsShortTerm && shortTerm.periodEnd === core.periodEnd) {
    return { ...(sumFacts(core, shortTerm) as SECFact), ...(core.partial ? { partial: true } : {}) };
  }
  return core;
}

export interface SECFundamentals {
  cik: string;
  /**
   * Shares used for per-share figures: the cover-page count where the issuer
   * files one, the weighted average diluted count otherwise.
   */
  dilutedShares: SECFact | null;
  financialDebt: SECFact | null;
  cash: SECFact | null;
  operatingLeases: SECFact | null;
  /** Rent charged through the income statement. Needed to undo the double
   *  count when leases are also treated as debt. */
  operatingLeaseExpense: SECFact | null;
  shareBasedCompensation: SECFact | null;
}

/**
 * Cash available to repay debt.
 *
 * The clean tag is preferred, but issuers abandon it: Starbucks last filed
 * CashAndCashEquivalentsAtCarryingValue in 2022 and now reports a combined
 * figure that folds in restricted cash. Restricted balances cannot be used to
 * retire debt, so netting them at full value against borrowings overstates
 * equity value.
 *
 * Where the issuer discloses the restricted portion it is subtracted; where it
 * does not, the figure is returned marked so the panel can say what it still
 * contains. Guessing a haircut would be worse than either.
 */
export async function resolveCash(source: FactsSource, cik: string): Promise<SECFact | null> {
  const [cash, restrictedCurrent, restrictedNoncurrent, marketable] = await Promise.all([
    fetchConcept(source, cik, SEC_CONCEPTS.cash),
    fetchConcept(source, cik, SEC_CONCEPTS.restrictedCash),
    fetchConcept(source, cik, SEC_CONCEPTS.restrictedCashNoncurrent),
    fetchConcept(source, cik, SEC_CONCEPTS.marketableSecuritiesCurrent),
  ]);
  return composeCash({ cash, restrictedCurrent, restrictedNoncurrent, marketable });
}

/**
 * Cash available to repay debt, from the parts the issuer files: cash, less
 * restricted cash where the tag folds it in, plus the current marketable
 * securities held as a reserve. Every part has to describe the same
 * balance-sheet date as the cash figure, or it is arithmetic on two
 * different quarters.
 */
export function composeCash(parts: {
  cash: SECFact | null;
  restrictedCurrent: SECFact | null;
  restrictedNoncurrent: SECFact | null;
  marketable: SECFact | null;
}): SECFact | null {
  const { cash, restrictedCurrent, restrictedNoncurrent, marketable } = parts;
  if (!cash) return null;

  let resolved: SECFact = cash;
  if (cash.concept.includes("RestrictedCash")) {
    // Only halves describing the same balance-sheet date as the cash figure
    // can be netted against it.
    const restricted = [restrictedCurrent, restrictedNoncurrent]
      .filter((fact): fact is SECFact => !!fact && fact.periodEnd === cash.periodEnd)
      .reduce((sum, fact) => sum + fact.value, 0);
    resolved =
      restricted > 0
        ? { ...cash, value: Math.max(0, cash.value - restricted), concept: `${cash.concept} less restricted` }
        : { ...cash, includesRestricted: true };
  }

  if (marketable && marketable.value > 0 && marketable.periodEnd === cash.periodEnd) {
    return { ...resolved, value: resolved.value + marketable.value, concept: `${resolved.concept} + ${marketable.concept}` };
  }
  return resolved;
}

export async function resolveRevenueTtm(source: FactsSource, cik: string): Promise<SECRevenueTtm | null> {
  const facts = await source.companyFacts(cik);
  const scope = facts?.["us-gaap"];
  if (!scope) return null;
  let best: SECRevenueTtm | null = null;
  for (const concept of SEC_CONCEPTS.revenue) {
    const entry = scope[concept];
    if (!entry) continue;
    const got = composeRevenueTtm(extractFactRows(entry), concept);
    if (got && (!best || got.periodEnd > best.periodEnd)) best = got;
  }
  return best;
}

/**
 * Every figure we take from EDGAR, for one company.
 *
 * Concepts are judged separately: a company that does not report operating
 * leases should still give us its share count, so one missing concept never
 * sinks the rest. A concept that resolves to nothing stays null rather than
 * becoming zero, because the two mean opposite things - one is a company with
 * no debt, the other is a tag we failed to find.
 */
export async function fundamentalsForCik(
  source: FactsSource,
  cik: string
): Promise<SECFundamentals> {
  const [
    coverShares,
    undimensionedDilutedShares,
    financialDebt,
    cash,
    leaseNoncurrent,
    leaseCurrent,
    operatingLeaseExpense,
    shareBasedCompensation,
  ] = await Promise.all([
    // Point in time, from the cover of the filing, under the dei taxonomy:
    // the fallback when no diluted count was filed.
    fetchConcept(source, cik, SEC_CONCEPTS.sharesOutstandingCover, "any", "dei"),
    // The count in use: diluted, from the latest quarterly filing.
    fetchConcept(source, cik, SEC_CONCEPTS.dilutedShares, "quarterly"),
    resolveFinancialDebt(source, cik),
    resolveCash(source, cik),
    fetchConcept(source, cik, SEC_CONCEPTS.operatingLeaseNoncurrent),
    fetchConcept(source, cik, SEC_CONCEPTS.operatingLeaseCurrent),
    // Annual: an adjustment applied to a full-year FCF has to be a full year
    // of rent, not a quarter of it.
    fetchConcept(source, cik, SEC_CONCEPTS.operatingLeaseExpense, "annual"),
    fetchConcept(source, cik, SEC_CONCEPTS.shareBasedCompensation, "annual"),
  ]);
  const [revenueTtm, operatingCashFlowAnnual, acquisitions, divestitures, redeemablePreferred, preferredConversionShares] = await Promise.all([
    resolveRevenueTtm(source, cik),
    fetchConcept(source, cik, OPERATING_CASH_FLOW_CONCEPTS, "annual"),
    fetchConcept(source, cik, SEC_CONCEPTS.acquisitions),
    fetchConcept(source, cik, SEC_CONCEPTS.divestitures),
    fetchConcept(source, cik, SEC_CONCEPTS.redeemablePreferred),
    fetchConcept(source, cik, SEC_CONCEPTS.preferredConversionShares, "quarterly"),
  ]);

  // A multi-class issuer files its share counts by class only; the
  // filing itself is the only place the as-converted count exists.
  const weightedDilutedShares = undimensionedDilutedShares ?? (await source.classDilutedShares(cik));

  return {
    cik,
    dilutedShares: weightedDilutedShares ?? coverShares,
    coverShares,
    weightedDilutedShares,
    financialDebt,
    cash,
    operatingLeases: sumFacts(leaseNoncurrent, leaseCurrent),
    operatingLeaseExpense,
    shareBasedCompensation,
    revenueTtm,
    operatingCashFlowAnnual,
    acquisitions,
    divestitures,
    // Only a figure that describes the same balance sheet as the cash is
    // the company's claim today; an old one is a preferred since redeemed.
    redeemablePreferred:
      redeemablePreferred && cash && redeemablePreferred.periodEnd === cash.periodEnd ? redeemablePreferred : null,
    // The quarter the diluted count describes, or it says nothing about it.
    preferredConversionShares:
      preferredConversionShares && weightedDilutedShares && preferredConversionShares.periodEnd === weightedDilutedShares.periodEnd
        ? preferredConversionShares
        : null,
  };
}
