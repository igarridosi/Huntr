/**
 * SEC EDGAR XBRL client.
 *
 * Why this exists: yfinance's `info` dictionary is unofficial scraping. It
 * exposes several share-count fields that do not agree with each other and are
 * not always current, and the equity value gets divided by whichever one you
 * happened to read. The result still looks plausible, which is what makes it
 * dangerous - a 6% error in the share count is enough to move a decision and
 * nothing on screen says anything is wrong.
 *
 * EDGAR is the filing itself: free, no API key, and it carries the form and
 * filing date alongside every figure so the interface can say how old a number
 * is. It requires an identifying User-Agent, which the SEC enforces.
 *
 * Everything here degrades rather than fails. A foreign issuer with no XBRL, a
 * ticker with no CIK, a concept a company does not report - each returns null
 * and the caller falls back to Yahoo, marked as such in the UI.
 */

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_CONCEPT_URL = "https://data.sec.gov/api/xbrl/companyconcept";
const SEC_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts";

/**
 * The SEC asks for a real contact address here and rate-limits anything that
 * does not identify itself. Configurable so a deployment can use its own.
 */
export const USER_AGENT = process.env.SEC_USER_AGENT?.trim() || SEC_DEFAULT_USER_AGENT;

export { SEC_CONCEPTS, OPERATING_CASH_FLOW_CONCEPTS } from "@/lib/sec/concepts";
export type { SECConceptKey, SECTaxonomy } from "@/lib/sec/concepts";
export {
  MAX_FACT_AGE_DAYS,
  STALE_FACT_DAYS,
  extractFactRows,
  factAgeInDays,
  pickFresher,
  selectLatestFact,
  sumFacts,
} from "@/lib/sec/facts";
export type { FactPeriod, SECFact } from "@/lib/sec/facts";
export { parseClassDilutedShares } from "@/lib/sec/class-shares";
export { composeRevenueTtm } from "@/lib/sec/revenue-ttm";
export type { SECRevenueTtm } from "@/lib/sec/revenue-ttm";
export { composeFinancialDebt } from "@/lib/sec/fundamentals";
export type { SECFundamentals } from "@/lib/sec/fundamentals";

import type { SECTaxonomy } from "@/lib/sec/concepts";
import { SEC_DEFAULT_USER_AGENT } from "@/lib/sec/user-agent";
import type { FactPeriod, SECFact } from "@/lib/sec/facts";
import { parseClassDilutedShares } from "@/lib/sec/class-shares";
import * as shared from "@/lib/sec/fundamentals";
import type { FactsSource, SECFundamentals } from "@/lib/sec/fundamentals";
import type { SECRevenueTtm } from "@/lib/sec/revenue-ttm";

/**
 * Whether a share count squares with the market capitalisation.
 *
 * The cheapest check in the whole model per line of code: price times shares
 * has to land on the reported market cap, and when it does not, one of the two
 * is from the wrong company, the wrong class of stock, or the wrong quarter.
 */
export interface MarketCapCheck {
  implied: number;
  reported: number;
  deviation: number;
  agrees: boolean;
}

export const MARKET_CAP_TOLERANCE = 0.03;

export function checkMarketCap(
  price: number,
  shareCount: number,
  reportedMarketCap: number,
  tolerance: number = MARKET_CAP_TOLERANCE
): MarketCapCheck | null {
  if (!(price > 0) || !(shareCount > 0) || !(reportedMarketCap > 0)) return null;

  const implied = price * shareCount;
  const deviation = implied / reportedMarketCap - 1;

  return {
    implied,
    reported: reportedMarketCap,
    deviation,
    agrees: Math.abs(deviation) <= tolerance,
  };
}

/**
 * Which filed share count to divide by: the weighted diluted count of the
 * latest quarterly filing, whenever there is one.
 *
 * One criterion, so two companies' per-share figures are built the same
 * way. The diluted count covers every class and the options and units
 * that will become shares; the cover-page count is one class, basic, on
 * one day. The diluted count is an average over the quarter and lags a
 * buyback by up to three months — that is what the market-cap cross-check
 * is for, and it now reports the gap and its direction instead of
 * quietly switching counts. The cover count is used only when no diluted
 * count was filed.
 */
export function selectShareCount(cover: SECFact | null, weightedDiluted: SECFact | null): SECFact | null {
  return weightedDiluted ?? cover;
}

/**
 * Net debt, itemised.
 *
 * Yahoo generally leaves operating lease liabilities out of debt. For a
 * retailer, a restaurant group or a gym chain that understates net debt by
 * billions and inflates equity value by the same amount, silently. The
 * breakdown exists so the number can be argued with rather than trusted.
 *
 * A negative result is a real answer - the company holds more cash than debt -
 * and callers must add it to enterprise value rather than subtract it. Getting
 * that sign wrong is a common and expensive mistake, so the shape here makes
 * it explicit rather than leaving it to a subtraction somewhere downstream.
 */
export interface NetDebtBreakdown {
  financialDebt: number;
  operatingLeases: number;
  cash: number;
  netDebt: number;
  includesLeases: boolean;
  /** True when the company holds more cash than debt. */
  isNetCash: boolean;
}

export function buildNetDebt(params: {
  financialDebt: number;
  operatingLeases: number;
  cash: number;
  includeLeases?: boolean;
}): NetDebtBreakdown {
  // Option B by default. Under ASC 842 the operating lease charge is already
  // deducted from operating cash flow, so the FCF the model discounts is
  // already net of rent. Adding the lease liability to net debt as well
  // discounts the same obligation twice - and doing only that, without
  // returning the rent to FCF, is the one combination that is simply wrong.
  // Off by default because it needs less data and agrees with the cash flow
  // already in hand.
  const includesLeases = params.includeLeases ?? false;
  const financialDebt = Math.max(0, params.financialDebt || 0);
  const operatingLeases = Math.max(0, params.operatingLeases || 0);
  const cash = Math.max(0, params.cash || 0);

  const netDebt =
    financialDebt + (includesLeases ? operatingLeases : 0) - cash;

  return {
    financialDebt,
    operatingLeases,
    cash,
    netDebt,
    includesLeases,
    isNetCash: netDebt < 0,
  };
}

/**
 * Whether leases can be capitalised at all, and what it costs the FCF.
 *
 * Capitalising them (Option A) means two moves that have to happen together:
 * the lease liability joins net debt, and the rent charge comes back into free
 * cash flow, because the obligation is now being valued on the balance sheet
 * instead of expensed through the cash flow. Doing the first without the
 * second double counts.
 *
 * When the rent charge cannot be found there is no honest way to make the
 * second move, so the option is refused rather than half-applied.
 */
export interface LeaseTreatment {
  /** True when the rent charge is available and the toggle can be offered. */
  canCapitalise: boolean;
  /** Annual operating lease expense to add back, or null when unavailable. */
  leaseExpense: number | null;
  /** Why the option is unavailable, for the interface to explain. */
  reason: string | null;
}

export function resolveLeaseTreatment(
  operatingLeases: number,
  leaseExpense: number | null
): LeaseTreatment {
  if (!(operatingLeases > 0)) {
    return {
      canCapitalise: false,
      leaseExpense: null,
      reason: "This company reports no operating lease liability.",
    };
  }

  if (leaseExpense === null || !(leaseExpense > 0)) {
    return {
      canCapitalise: false,
      leaseExpense: null,
      reason:
        "The annual operating lease charge is not in this filing, so the rent cannot be added back to free cash flow. Capitalising leases without that adjustment would count the same obligation twice.",
    };
  }

  return { canCapitalise: true, leaseExpense, reason: null };
}

/**
 * Free cash flow under the chosen lease treatment.
 *
 * Capitalising a lease does not hand the whole rent back to free cash flow.
 * The obligation moves onto the balance sheet as a liability with a matching
 * right-of-use asset, and that asset depreciates. Rent is roughly the sum of
 * that depreciation and the interest on the liability, so the only part that
 * genuinely returns to cash flow is the interest - the depreciation is still
 * a real cost of using the space.
 *
 * This matters arithmetically, not just conceptually. Adding the full rent
 * back credits a perpetuity of it against a liability that covers a finite
 * lease term: on a representative case, 310M of rent capitalised at a 6.5%
 * spread is worth 4.77B against a reported liability of 2.14B, so the toggle
 * would move the valuation by 16% in the direction of whichever treatment
 * flattered the company. Returning the interest alone is the standard
 * adjustment and is what makes the two treatments agree, which is the point
 * of offering them as alternatives rather than as different answers.
 *
 * `discountRate` is the rate the caller will capitalise this stream at - the
 * WACC less terminal growth, not the WACC itself. Charge it at the full WACC
 * and the add-back is worth more in present value than the liability it is
 * meant to offset, which turns a compensating adjustment into a thumb on the
 * scale.
 *
 * Capped at the rent actually paid: you can never add back more than left.
 */
export function adjustFCFForLeases(params: {
  freeCashFlow: number;
  leaseExpense: number | null;
  leaseLiability: number;
  discountRate: number;
  capitalise: boolean;
}): number {
  const { freeCashFlow, leaseExpense, leaseLiability, discountRate, capitalise } =
    params;
  if (!capitalise || leaseExpense === null) return freeCashFlow;

  const impliedInterest = Math.max(0, leaseLiability) * Math.max(0, discountRate);
  return freeCashFlow + Math.min(Math.max(0, leaseExpense), impliedInterest);
}

/**
 * FCF with stock compensation treated as the cost to shareholders that it is.
 *
 * Yahoo's free cash flow is operating cash flow less capex, and operating cash
 * flow adds back share-based compensation because no cash left the building.
 * No cash did, but ownership did: the shareholder pays for it in dilution. For
 * a company paying out 10% of revenue in stock, the two margins are a different
 * business.
 */
export function adjustFCFForSBC(params: {
  freeCashFlow: number;
  shareBasedCompensation: number;
  revenue: number;
  deductSBC: boolean;
}): { fcf: number; margin: number; unadjustedMargin: number } {
  const { freeCashFlow, shareBasedCompensation, revenue, deductSBC } = params;
  const sbc = Math.max(0, shareBasedCompensation || 0);
  const fcf = deductSBC ? freeCashFlow - sbc : freeCashFlow;

  return {
    fcf,
    margin: revenue > 0 ? fcf / revenue : 0,
    unadjustedMargin: revenue > 0 ? freeCashFlow / revenue : 0,
  };
}

// ─────────────────────────────────────────────────────────
// Network
// ─────────────────────────────────────────────────────────

async function secFetch(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      // Fundamentals move quarterly; the SEC asks callers not to hammer it.
      next: { revalidate: 24 * 60 * 60 },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** ticker -> CIK, resolved once and kept for the lifetime of the process. */
let cikMapPromise: Promise<Map<string, string>> | null = null;

export async function getCIKMap(): Promise<Map<string, string>> {
  if (!cikMapPromise) {
    cikMapPromise = (async () => {
      const payload = await secFetch(SEC_TICKERS_URL);
      const map = new Map<string, string>();
      if (!payload || typeof payload !== "object") return map;

      for (const entry of Object.values(payload as Record<string, unknown>)) {
        const row = entry as { ticker?: string; cik_str?: number | string };
        if (!row?.ticker || row.cik_str === undefined) continue;
        // EDGAR keys everything on a zero-padded ten-digit CIK.
        map.set(String(row.ticker).toUpperCase(), String(row.cik_str).padStart(10, "0"));
      }
      return map;
    })().catch(() => new Map<string, string>());
  }
  return cikMapPromise;
}

export async function resolveCIK(ticker: string): Promise<string | null> {
  const map = await getCIKMap();
  return map.get(ticker.trim().toUpperCase()) ?? null;
}

/**
 * Every us-gaap fact a company has ever filed, in one request.
 *
 *  is per-tag and, for some issuers, simply broken: Ford
 * returns HTTP 200 with the tag metadata and an empty  object for
 * concepts it demonstrably files - which reads downstream as "this company
 * has no cash".  returns the same data correctly, tells us
 * which tags the issuer actually uses rather than making us guess, and costs
 * one request instead of one per tag in every cascade.
 */
const companyFactsCache = new Map<
  string,
  Promise<Record<string, Record<string, unknown>> | null>
>();

export async function getCompanyFacts(
  cik: string
): Promise<Record<string, Record<string, unknown>> | null> {
  const cached = companyFactsCache.get(cik);
  if (cached) return cached;

  const request = (async () => {
    const payload = await secFetch(`${SEC_FACTS_URL}/CIK${cik}.json`);
    // Every taxonomy, not just us-gaap: the share count that matters lives
    // under dei, on the cover page of the filing.
    const facts = (payload as {
      facts?: Record<string, Record<string, unknown>>;
    })?.facts;
    return facts ?? null;
  })();

  companyFactsCache.set(cik, request);
  return request;
}

// ─────────────────────────────────────────────────────────
// Multi-class issuers: the diluted count from the filing itself
// ─────────────────────────────────────────────────────────

export const SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions";
export const SEC_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data";

const classDilutedCache = new Map<string, Promise<SECFact | null>>();

export async function fetchClassDilutedShares(cik: string): Promise<SECFact | null> {
  const cached = classDilutedCache.get(cik);
  if (cached) return cached;
  const request = (async () => {
    const submissions = (await secFetch(`${SEC_SUBMISSIONS_URL}/CIK${cik}.json`)) as {
      filings?: { recent?: { form?: string[]; accessionNumber?: string[]; primaryDocument?: string[]; filingDate?: string[] } };
    } | null;
    const recent = submissions?.filings?.recent;
    if (!recent?.form) return null;
    const i = recent.form.findIndex((f) => f === "10-Q" || f === "10-K");
    if (i < 0) return null;
    const accession = recent.accessionNumber?.[i]?.replace(/-/g, "");
    const doc = recent.primaryDocument?.[i];
    if (!accession || !doc) return null;
    try {
      const response = await fetch(`${SEC_ARCHIVES_URL}/${Number(cik)}/${accession}/${doc}`, {
        headers: { "User-Agent": USER_AGENT },
        next: { revalidate: 24 * 60 * 60 },
      });
      if (!response.ok) return null;
      return parseClassDilutedShares(await response.text(), { form: recent.form[i], filed: recent.filingDate?.[i] ?? "" });
    } catch {
      return null;
    }
  })();
  classDilutedCache.set(cik, request);
  return request;
}


// ─────────────────────────────────────────────────────────
// The live source, and the entry points the app calls
// ─────────────────────────────────────────────────────────

/** EDGAR over the network, cached for the lifetime of the process. */
export const liveFactsSource: FactsSource = {
  companyFacts: getCompanyFacts,
  concept: (cik, taxonomy, concept) => secFetch(`${SEC_CONCEPT_URL}/CIK${cik}/${taxonomy}/${concept}.json`),
  classDilutedShares: fetchClassDilutedShares,
};

export function fetchConcept(
  cik: string,
  concepts: readonly string[],
  period: FactPeriod = "any",
  taxonomy: SECTaxonomy = "us-gaap"
): Promise<SECFact | null> {
  return shared.fetchConcept(liveFactsSource, cik, concepts, period, taxonomy);
}

export function resolveFinancialDebt(cik: string): Promise<SECFact | null> {
  return shared.resolveFinancialDebt(liveFactsSource, cik);
}

export function resolveCash(cik: string): Promise<SECFact | null> {
  return shared.resolveCash(liveFactsSource, cik);
}

export function resolveRevenueTtm(cik: string): Promise<SECRevenueTtm | null> {
  return shared.resolveRevenueTtm(liveFactsSource, cik);
}

export async function getSECFundamentals(ticker: string): Promise<SECFundamentals | null> {
  const cik = await resolveCIK(ticker);
  if (!cik) return null;
  return shared.fundamentalsForCik(liveFactsSource, cik);
}
