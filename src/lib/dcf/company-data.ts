/**
 * Everything the DCF page derives from one company's raw data, before any
 * assumption is typed: the foreign-listing basis, the filed balance sheet,
 * the revenue bases, the margin record, and the adjustments between the
 * margin as reported and the margin the engine discounts.
 *
 * One function, so the page and the benchmark read the same company the
 * same way. The benchmark used to be a person exporting a JSON per ticker;
 * a copy of this logic in a script would have tested the copy.
 */
import type { CompanyFinancials, IncomeStatement } from "@/types/financials";
import type { StockQuote } from "@/types/stock";
import type { SECFundamentals } from "@/lib/api/sec-edgar";
import { convertFinancials, convertSecFundamentals, receiptShareCount, resolveAdrBasis, type AdrBasis } from "./adr-basis";
import { applySourcedBalanceSheet, buildSourcedFields, readCompanyFacts, type SourcedDCFFields, type ZeroSuspectField } from "@/lib/calculations/dcf-inputs-source";
import { calculateCAGR, generateDCFScenarios } from "@/lib/calculations";
import type { DCFScenarioSet } from "@/lib/calculations/dcf";
import { withCompanyFacts } from "./live-price";
import { revenueBaseDivergence, revenueBases, type RevenueBasis } from "./revenue-base";
import { buildMarginHistory } from "@/lib/calculations/margin-history";
import { looksLikeLender } from "./business-model";
import { detectRegimes, isMaterialDeal, PERIMETER_MONTHS } from "./regime";
import { valuationGate } from "./gate";
import { statementFreeCashFlow } from "./free-cash-flow";
import { debtInterestPoints, interestAddBack, interestIncomeStrip, trailingIncome, type InterestAddBack, type MarginAdjustments } from "./cash-flow-basis";

export interface CompanyDataInput {
  ticker: string;
  quote: StockQuote | null | undefined;
  profile?: { sector?: string | null; industry?: string | null } | null;
  /** The statements as fetched, in the reporting currency. */
  financials: CompanyFinancials | null | undefined;
  /** The filings as fetched, in the reporting currency. */
  sec: SECFundamentals | null | undefined;
  /** Units of the listing's currency per unit of the reporting one; only read for a foreign listing. */
  fxRate?: number | null;
  revenueBasisChoice?: RevenueBasis;
  balanceOverrides?: Partial<Record<ZeroSuspectField, number>>;
  shareCountBasis?: "filings" | "implied";
}

/** True when the listing trades in another currency than the statements are in. */
export function needsFx(quote: StockQuote | null | undefined): { from: string; to: string } | null {
  const from = quote?.financial_currency?.toUpperCase() ?? null;
  const to = quote?.currency?.toUpperCase() ?? null;
  return from && to && from !== to ? { from, to } : null;
}

const latest = <T extends { date: string }>(rows: readonly T[] | undefined): T | undefined =>
  [...(rows ?? [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1);

export function assembleCompanyData(input: CompanyDataInput) {
  const { quote, profile } = input;
  const rawFinancials =
    input.financials && input.ticker && input.financials.ticker?.toUpperCase() === input.ticker.toUpperCase() ? input.financials : null;
  const rawSec = input.sec ?? null;

  // A foreign listing (an ADR) valued in its own currency and per receipt.
  const fx = needsFx(quote);
  let adrBasis: AdrBasis | null = null;
  if (fx && quote) {
    const latestIncome = latest(rawFinancials?.income_statement.annual);
    const filed = rawSec?.dilutedShares?.value ?? latestIncome?.shares_outstanding_diluted ?? null;
    const implied = quote.price > 0 && quote.market_cap > 0 ? quote.market_cap / quote.price : null;
    adrBasis = resolveAdrBasis({ priceCurrency: fx.to, financialCurrency: fx.from, fx: input.fxRate, filedShares: filed, impliedShares: implied });
  }
  const financials = rawFinancials && adrBasis ? convertFinancials(rawFinancials, adrBasis) : rawFinancials;
  const sec = rawSec && adrBasis ? convertSecFundamentals(rawSec, adrBasis) : rawSec;

  const bases = revenueBases(financials);
  const revenueDivergence = revenueBaseDivergence(bases);
  const revenueBasis: RevenueBasis = input.revenueBasisChoice ?? bases.recommended ?? "manual";

  // Interest, on a trailing base read off the trailing four quarters.
  const latestAnnualIncome: IncomeStatement | undefined = latest(financials?.income_statement.annual);
  const interestStatement =
    (revenueBasis !== "fiscal_year" ? trailingIncome(financials?.income_statement.quarterly, latestAnnualIncome) : null) ?? latestAnnualIncome;
  const addBack: InterestAddBack | null = interestAddBack(interestStatement);
  const incomeStrip = interestIncomeStrip(interestStatement);

  // The Yahoo fallback reads the balance sheet directly, never the inputs.
  let sourcedFields: SourcedDCFFields | null = null;
  const sourceFields = (shareCountBasis: "filings" | "implied") => {
    if (!quote) return null;
    const latestBalance = latest(financials?.balance_sheet.annual);
    return buildSourcedFields({
      sec,
      yahoo: {
        sharesOutstanding: receiptShareCount(
          quote.shares_outstanding,
          quote.price > 0 && quote.market_cap > 0 ? quote.market_cap / quote.price : null,
          adrBasis
        ),
        totalDebt: latestBalance?.long_term_debt ?? null,
        // Cash and the short-term investments held beside it, as the filings path counts them.
        cash: latestBalance ? latestBalance.cash_and_equivalents + (latestBalance.short_term_investments ?? 0) : null,
      },
      price: quote.price,
      reportedMarketCap: quote.market_cap,
      overrides: input.balanceOverrides ?? {},
      shareCountBasis,
      borrowing: {
        interestToRevenue:
          interestStatement && interestStatement.revenue > 0 ? Math.abs(interestStatement.interest_expense || 0) / interestStatement.revenue : null,
        ifrsLeases: !!(sec?.leasePrincipal && sec.leasePrincipal.value > 0),
      },
    });
  };
  sourcedFields = sourceFields(input.shareCountBasis ?? "filings");
  // A foreign filer's filed count misses what a US filer's does not: On
  // files its A shares only (B carry a tenth of the economics), Novo its B
  // shares only, SAP its count before treasury shares. When the filed count
  // does not reconcile with the market cap, the market's count is the one
  // that describes the equity being priced. A US filer keeps the rule: the
  // filed diluted count, with the disagreement shown.
  const foreignFiler = !!fx || /^(20-F|40-F)/.test(rawSec?.dilutedShares?.form ?? "");
  if (!input.shareCountBasis && foreignFiler && sourcedFields?.marketCapCheck && !sourcedFields.marketCapCheck.agrees) {
    sourcedFields = sourceFields("implied");
  }

  // Stock compensation is always a cost, so there is no switch for it. The
  // margins on screen are free cash flow as reported - the same basis as the
  // record under the sliders and the reverse DCF - and the engine takes SBC
  // off both margins of all three scenarios. A switch only added a question
  // nobody could answer the same way twice: before the scenarios or after,
  // margins typed with it or without it.
  //
  // Measured over the same period as the revenue it is set against: the
  // trailing twelve months unless the closed year was chosen.
  const sbcTtm = sec?.shareBasedCompensationTtm?.value ?? null;
  const sbcAmount = Math.max(
    0,
    revenueBasis !== "fiscal_year" && sbcTtm !== null && sbcTtm > 0 ? sbcTtm : (sourcedFields?.shareBasedCompensation.value ?? 0)
  );

  /**
   * What the company has actually managed, which is what makes the implied
   * assumption meaningful rather than merely precise.
   *
   * Where the figures come from: `companyFinancials` is `getCompanyFinancials`
   * — the Alpha Vantage bundle (`financials-alpha-v2`) while one is on file
   * and under a week old, otherwise Yahoo's statements. Both feed the same
   * two series here:
   *
   *  - "Realised FCF margin by year" and the 5Y median under the sliders
   *    come from `buildMarginHistory`, which computes free cash flow itself
   *    as operating cash flow less |capital_expenditures|, paired by fiscal
   *    year. It never reads the vendor's `free_cash_flow` field, which is
   *    why the capex sign bug in the Alpha Vantage mapper (FCF = OCF + capex,
   *    fixed and repaired on read in `alpha-repair.ts`) never reached it.
   *  - The generated scenarios' base margin (`generateDCFScenarios`) reads
   *    the `free_cash_flow` field, and so did see the bug on a fresh bundle.
   *
   * Either way "capex" is what the vendor puts in it: Yahoo carries plant
   * plus additions of intangibles; Alpha Vantage varies by row (see the
   * note in `mapCashFlow`). The margins move with the source, not the code.
   */
  const sortedIncome = [...(financials?.income_statement.annual ?? [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const sortedCash = [...(financials?.cash_flow.annual ?? [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const revenues = sortedIncome.map((row) => row.revenue).filter((v) => v > 0);
  const latestBalanceRow = latest(financials?.balance_sheet.annual);
  const lender = sortedIncome.length >= 2 ? looksLikeLender({ industry: profile?.industry, balance: latestBalanceRow ?? null, income: sortedIncome.at(-1) ?? null }) : false;
  // Known only once the filings are read: until then a step in the record is still a possible change of perimeter.
  const latestRevenue = sortedIncome.at(-1)?.revenue ?? null;
  const perimeterEvent = sec
    ? isMaterialDeal(sec.acquisitions?.value, latestRevenue, quote?.market_cap) || isMaterialDeal(sec.divestitures?.value, latestRevenue)
    : undefined;
  const marginHistory =
    sortedIncome.length >= 2
      ? buildMarginHistory({ revenues: sortedIncome, cashFlows: sortedCash, sector: lender ? profile?.sector : null, years: 5, perimeterEvent })
      : null;


  // The IFRS lease principal against the revenue of the same fiscal year.
  const leasePrincipal = sec?.leasePrincipal ?? null;
  const leasePrincipalPoints =
    leasePrincipal && leasePrincipal.value > 0 && latestAnnualIncome && latestAnnualIncome.revenue > 0
      ? leasePrincipal.value / latestAnnualIncome.revenue
      : 0;
  // A debt-free IFRS filer's interest expense is lease interest, not a cost of borrowing.
  const interestPoints = debtInterestPoints(addBack?.marginPoints ?? 0, {
    ifrsLeases: leasePrincipalPoints > 0,
    financialDebt: sourcedFields?.netDebt.financialDebt ?? 0,
  });
  const adjustmentsFor = (baseRevenue: number): MarginAdjustments => ({
    interestPoints,
    interestIncomePoints: incomeStrip,
    sbcPoints: baseRevenue > 0 ? sbcAmount / baseRevenue : 0,
    leasePrincipalPoints,
  });

  return {
    /** Market capitalisation in the listing's currency, which the filings are converted to. */
    marketValue: quote?.market_cap ?? null,
    adrBasis,
    financials,
    sec,
    bases,
    revenueDivergence,
    revenueBasis,
    sourcedFields,
    sbcTtm,
    sbcAmount,
    revenueHistory: {
      cagr5: sortedIncome.length >= 2 ? calculateCAGR(revenues, 5) : null,
      cagr10: sortedIncome.length >= 2 ? calculateCAGR(revenues, 10) : null,
      fcfMargin5: marginHistory?.median ?? null,
      marginHistory,
      lender,
      perimeterEvent,
    },
    latestAnnualIncome,
    latestAnnualRows: { cash: latest(financials?.cash_flow.annual) ?? null, income: latestAnnualIncome ?? null },
    addBack,
    incomeStrip,
    leasePrincipalPoints,
    interestPoints,
    adjustmentsFor,
  };
}

export type CompanyData = ReturnType<typeof assembleCompanyData>;

/** The figures of the model in use that the checks read: the live inputs on the page, the populated Base in the benchmark. */
export interface FactsInUse {
  sharesOutstanding: number;
  currentPrice: number;
  totalDebt: number;
}

/** The checks that hold a value back, for a company and the facts in use. */
export function gateFor(data: CompanyData, quote: StockQuote | null | undefined, inputs: FactsInUse, perimeterConfirmed = false) {
  const { sourcedFields, financials, sec, revenueHistory } = data;
  return valuationGate({
    shares: inputs.sharesOutstanding,
    // Diluted when the count in use is the filed weighted-diluted one.
    dilutedShares: !!sourcedFields?.dilutedCount && sourcedFields.shareCount.basis === "filings",
    price: inputs.currentPrice,
    reportedMarketCap: quote?.market_cap ?? null,
    cashFlow: { annual: financials?.cash_flow.annual ?? [], quarterly: financials?.cash_flow.quarterly ?? [] },
    debtInUse: inputs.totalDebt,
    debtSource: sourcedFields?.financialDebt.source ?? null,
    filedDebt: sec?.financialDebt ?? null,
    revenue: { basis: data.revenueBasis, divergence: data.revenueDivergence, perimeterConfirmed, organic: revenueHistory.perimeterEvent === false },
    marginHistory: revenueHistory.marginHistory,
    lender: revenueHistory.lender,
  });
}

/**
 * The regime, from the statements: capex and margin off the latest fiscal
 * year on the defined basis, leverage off EBITDA, the terminal weight off
 * the current run, the perimeter off the filings.
 */
export function regimesFor(data: CompanyData, totalDebt: number, result: { enterpriseValue: number; pvTerminalValue: number } | null) {
  const { cash, income } = data.latestAnnualRows;
  const fcf = cash ? statementFreeCashFlow(cash, "annual").value : null;
  // Measured from the latest statement on file, not the clock: "recent"
  // means recent relative to the history in use.
  const asOf = income?.date ?? cash?.date ?? null;
  const recent = (fact: { value: number; periodEnd: string } | null | undefined) => {
    if (!fact || !(fact.value > 0) || !asOf) return null;
    const ageMonths = (Date.parse(asOf) - Date.parse(fact.periodEnd)) / (30.44 * 86_400_000);
    return ageMonths <= PERIMETER_MONTHS ? { value: fact.value, periodEnd: fact.periodEnd } : null;
  };
  // The earlier years' capex over revenue, matched by fiscal year end.
  const revenueByDate = new Map((data.financials?.income_statement.annual ?? []).map((row) => [row.date, row.revenue]));
  const capexHistory = (data.financials?.cash_flow.annual ?? [])
    .filter((row) => row.date !== cash?.date)
    .map((row) => {
      const revenue = revenueByDate.get(row.date);
      return revenue && revenue > 0 ? Math.abs(row.capital_expenditures) / revenue : NaN;
    })
    .filter((value) => Number.isFinite(value));
  return detectRegimes({
    lender: data.revenueHistory.lender,
    capexToRevenue: cash && income && income.revenue > 0 ? Math.abs(cash.capital_expenditures) / income.revenue : null,
    capexHistory,
    terminalWeight: result && result.enterpriseValue > 0 ? result.pvTerminalValue / result.enterpriseValue : null,
    debtToEbitda: income && income.ebitda > 0 ? totalDebt / income.ebitda : null,
    fcfMargin: fcf !== null && income && income.revenue > 0 ? fcf / income.revenue : null,
    perimeter: {
      divergence: data.revenueDivergence?.deviation ?? null,
      acquisitions: recent(data.sec?.acquisitions),
      divestitures: recent(data.sec?.divestitures),
      revenue: income?.revenue ?? null,
      marketValue: data.marketValue,
    },
  });
}

/**
 * The scenarios Auto-Populate puts on screen: the generator's operating
 * assumptions, the filed balance sheet on all three, and the revenue base
 * the company's quarters recommend.
 *
 * The generator starts from the last closed fiscal year. The base in use is
 * the trailing twelve months whenever quarters have been reported since -
 * Celsius' closed 2025 was 21% short of the twelve months to June 2026, and
 * every projected flow with it - on all three scenarios, so the reverse DCF
 * and the export read the same figure as the sliders.
 */
export function populateScenarios(data: CompanyData, quote: StockQuote, sector: string | null | undefined): DCFScenarioSet | null {
  if (!data.financials) return null;
  const generated = generateDCFScenarios({ quote, financials: data.financials, sector: sector ?? undefined });
  if (!generated) return null;
  const { sourcedFields } = data;
  const sourced: DCFScenarioSet = sourcedFields
    ? {
        bear: { ...generated.bear, inputs: applySourcedBalanceSheet(generated.bear.inputs, sourcedFields) },
        base: { ...generated.base, inputs: applySourcedBalanceSheet(generated.base.inputs, sourcedFields) },
        bull: { ...generated.bull, inputs: applySourcedBalanceSheet(generated.bull.inputs, sourcedFields) },
        waccEstimate: generated.waccEstimate,
      }
    : generated;
  const chosen = data.bases.recommended === "ttm" ? data.bases.ttm : data.bases.fiscalYear;
  return chosen ? withCompanyFacts(sourced, { ...readCompanyFacts(sourced.base.inputs), baseRevenue: chosen.value }) : sourced;
}
