import type {
  DCFInputs,
  DCFResult,
  DCFScenarioKey,
  DCFScenarioSet,
  MonteCarloResult,
} from "./dcf";
import { runDCF } from "./dcf";
import {
  applyCompanyFacts,
  applySourcedBalanceSheet,
  findCompanyFactDivergence,
  readCompanyFacts,
  COMPANY_FACT_KEYS,
  type CompanyFactDivergence,
  type SourcedDCFFields,
} from "./dcf-inputs-source";
import type {
  ConvictionBreakdown,
  StressCase,
  TradingZones,
  WeightedReference,
} from "./dcf-decision";
import type { ValuationGuard } from "./dcf-currency";

/**
 * The whole model, in one file, for a reader that is not this interface.
 *
 * The panels here are built for a person scrolling: figures are rounded,
 * labelled in prose and spread across a dozen components. Handing that to a
 * language model means pasting screenshots and hoping. This is the same model
 * written for something that reads structure - every scenario, its assumptions
 * and its outputs side by side, with the provenance of the balance sheet
 * attached so the reader can tell a filed figure from a fallback.
 *
 * Deliberately not a dump of internal state: no component flags, no defaults
 * nobody set. Everything here is either an assumption someone chose or a
 * number the model produced from one.
 */
export interface DCFScenarioExport {
  schema: "huntr.dcf.scenarios";
  version: 1;
  generatedAt: string;
  ticker: string;
  companyName: string | null;
  currentPrice: number;
  activeScenario: DCFScenarioKey;
  /**
   * Where the revenue the projection starts from came from: the trailing
   * twelve months, the last closed fiscal year, or a figure entered by
   * hand — with the period it covers and its close, so the base can be
   * audited against the filing later. Absent from files written before
   * the basis was recorded.
   */
  revenueBase?: {
    basis: "ttm" | "fiscal_year" | "manual";
    value: number;
    periodStart: string | null;
    periodEnd: string | null;
    periods: string | null;
  };
  /**
   * The unit every figure below is in, and whether they may be believed.
   *
   * A file with no currency in it is how a yen valuation reached a reader as
   * dollars. When `usable` is false the scenarios are still written - the
   * assumptions are what a reader needs in order to diagnose it - but
   * `decision` is dropped, because a recommendation drawn from a broken unit
   * should not survive the export.
   */
  currency: {
    reporting: string | null;
    price: string | null;
    mismatch: boolean;
    usable: boolean;
    reason: string | null;
    message: string;
  };
  balanceSheet: {
    /** True when the figures below came from filings rather than a fallback. */
    fromFilings: boolean;
    financialDebt: number;
    operatingLeases: number;
    cash: number;
    netDebt: number;
    leasesCapitalised: boolean;
    sharesOutstanding: number;
    /** Anything known to be imprecise, in the words the panel uses. */
    caveats: string[];
    /** Whether price x shares reconciles with the reported market cap. */
    marketCapAgrees: boolean | null;
    /**
     * Fields whose figure is a placeholder rather than something reported.
     *
     * Exported as names rather than left as zeros, because a reader parsing
     * `financialDebt: 0` has no way to tell a debt-free company from a debt
     * figure nobody found - which is the difference between net cash and a
     * 113.8% debt-to-equity ratio.
     */
    unresolvedFields: readonly string[];
    /**
     * Which share count the per-share figures were divided by.
     *
     * A count that is wrong by a clean factor produces a valuation that is
     * wrong by the same factor and looks entirely normal, so the file names
     * the basis and both candidates rather than a bare number.
     */
    shareCount: {
      basis: string;
      filed: number | null;
      impliedFromMarketCap: number | null;
      deviation: number | null;
      /** True when the two differ by almost exactly a whole number. */
      splitLike: boolean;
    };
  } | null;
  scenarios: DCFScenarioExportEntry[];
  simulation: {
    runs: number;
    mean: number;
    median: number;
    p10: number;
    p25: number;
    p75: number;
    p90: number;
    probabilityAbovePrice: number;
  } | null;
  decision: {
    signal: ConvictionBreakdown["signal"];
    score: number;
    suggestedPosition: string;
    /**
     * What the score was measured against.
     *
     * Named because it is deliberately not any one scenario: the score used to
     * read whichever was on screen, so the same company recommended different
     * things depending on the open tab.
     */
    measuredAgainst: {
      basis: "weighted-scenarios" | "active-scenario";
      intrinsicValuePerShare: number;
      upside: number;
    } | null;
    stressCase: { value: number; boundBy: StressCase["source"] };
    entryZone: {
      low: number;
      high: number;
      trim: number;
      /** False when the band is too far below the price to be a target. */
      relevant: boolean;
      gapToPrice: number;
    };
    factors: Array<{
      label: string;
      raw: number;
      points: number;
      maxPoints: number;
    }>;
  } | null;
  /** Departures from the record the interface flagged, verbatim. */
  warnings: string[];
  /**
   * What was checked before the file was written, and what failed.
   *
   * Bugs A, C and E were each declared fixed once and came back, because the
   * tests proved a function behaved and never proved the file was right. This
   * block is the check moved to the last possible moment: it runs on every
   * export, against the values actually being written. An empty `divergences`
   * is evidence; a populated one names the scenario and field that disagreed,
   * and the figures below it are the corrected ones.
   */
  integrity: {
    companyFactsChecked: readonly string[];
    divergences: CompanyFactDivergence[];
  };
}

export interface DCFScenarioExportEntry {
  key: DCFScenarioKey;
  label: string;
  assumptions: {
    baseRevenue: number;
    growthRatePhase1: number;
    yearsPhase1: number;
    growthRatePhase2: number;
    yearsPhase2: number;
    baseFCFMargin: number;
    terminalFCFMargin: number;
    fcfMarginMode: DCFInputs["fcfMarginMode"];
    wacc: number;
    terminalGrowthRate: number;
    midYearConvention: boolean;
  };
  outputs: {
    intrinsicValuePerShare: number;
    upside: number;
    enterpriseValue: number;
    equityValue: number;
    netDebt: number;
    pvProjectedFCF: number;
    pvTerminalValue: number;
    terminalValueWeight: number;
  };
  /** Year by year, so the shape of the projection survives the export. */
  projection: Array<{
    year: number;
    revenue: number;
    fcfMargin: number;
    freeCashFlow: number;
    presentValue: number;
  }>;
}

function summariseResult(result: DCFResult): DCFScenarioExportEntry["outputs"] {
  return {
    intrinsicValuePerShare: result.intrinsicValuePerShare,
    upside: result.upside,
    enterpriseValue: result.enterpriseValue,
    equityValue: result.equityValue,
    netDebt: result.netDebt,
    pvProjectedFCF: result.enterpriseValue - result.pvTerminalValue,
    pvTerminalValue: result.pvTerminalValue,
    terminalValueWeight:
      result.enterpriseValue > 0 ? result.pvTerminalValue / result.enterpriseValue : 0,
  };
}

export function buildScenarioExport(params: {
  ticker: string;
  companyName?: string | null;
  currentPrice: number;
  scenarios: DCFScenarioSet;
  activeScenario: DCFScenarioKey;
  /** The live inputs, which may have been edited away from the scenario. */
  liveInputs: DCFInputs;
  sourcedFields?: SourcedDCFFields | null;
  monteCarlo?: MonteCarloResult | null;
  conviction?: ConvictionBreakdown | null;
  stress?: StressCase | null;
  zones?: TradingZones | null;
  /** The scenario-independent valuation the score was built on. */
  scoreReference?: WeightedReference | null;
  warnings?: string[];
  guard?: ValuationGuard | null;
  revenueBase?: DCFScenarioExport["revenueBase"];
  now?: Date;
}): DCFScenarioExport {
  const {
    ticker,
    companyName = null,
    currentPrice,
    scenarios,
    activeScenario,
    liveInputs,
    sourcedFields = null,
    monteCarlo = null,
    conviction = null,
    stress = null,
    zones = null,
    scoreReference = null,
    warnings = [],
    guard = null,
    revenueBase,
    now = new Date(),
  } = params;

  const keys: DCFScenarioKey[] = ["bear", "base", "bull"];

  /**
   * One balance sheet, one revenue base, one share count, for all three.
   *
   * Taken from the filings where they resolved, and from the live inputs
   * otherwise. Net debt is a property of the company: it is arithmetically
   * impossible for Bear and Bull to disagree about it, so when they do the
   * ranking between scenarios is meaningless and the file must not carry the
   * disagreement forward silently.
   */
  const reference = readCompanyFacts(
    sourcedFields ? applySourcedBalanceSheet(liveInputs, sourcedFields) : liveInputs
  );

  const divergences = findCompanyFactDivergence(
    reference,
    keys.map((key) => ({
      scenario: key,
      facts: readCompanyFacts(
        key === activeScenario ? liveInputs : scenarios[key].inputs
      ),
    }))
  );

  const entries = keys.map<DCFScenarioExportEntry>((key) => {
    // The active scenario is exported as it currently stands, not as it was
    // generated. Anything else would export a model the user is not looking
    // at, which is the one thing an export must never do.
    //
    // The company facts are then forced back to the single reference, so the
    // three entries are guaranteed to describe one company whatever state the
    // interface was in. Assumptions - growth, margins, WACC, the terminal rate
    // - are left exactly as each scenario holds them, because disagreeing
    // about those is the entire point of having three.
    const inputs = applyCompanyFacts(
      key === activeScenario ? liveInputs : scenarios[key].inputs,
      reference
    );
    const result = runDCF(inputs);

    return {
      key,
      label: scenarios[key].label,
      assumptions: {
        baseRevenue: inputs.baseRevenue,
        growthRatePhase1: inputs.growthRatePhase1,
        yearsPhase1: inputs.yearsPhase1,
        growthRatePhase2: inputs.growthRatePhase2,
        yearsPhase2: inputs.yearsPhase2,
        baseFCFMargin: inputs.baseFCFMargin,
        terminalFCFMargin: inputs.terminalFCFMargin,
        fcfMarginMode: inputs.fcfMarginMode,
        wacc: inputs.wacc,
        terminalGrowthRate: inputs.terminalGrowthRate,
        midYearConvention: inputs.midYearConvention ?? false,
      },
      outputs: summariseResult(result),
      projection: result.projections.map((row) => ({
        year: row.year,
        revenue: row.revenue,
        fcfMargin: row.fcfMargin,
        freeCashFlow: row.fcf,
        presentValue: row.pvFCF,
      })),
    };
  });

  const caveats = sourcedFields
    ? [
        sourcedFields.cash.caveat,
        sourcedFields.financialDebt.caveat,
        sourcedFields.sharesOutstanding.caveat,
      ].filter((caveat): caveat is string => !!caveat)
    : [];

  return {
    schema: "huntr.dcf.scenarios",
    version: 1,
    generatedAt: now.toISOString(),
    ticker: ticker.toUpperCase(),
    companyName,
    currentPrice,
    activeScenario,
    currency: {
      reporting: guard?.currency ?? null,
      price: guard?.priceCurrency ?? null,
      mismatch: guard?.currencyMismatch ?? false,
      usable: guard ? guard.usable : true,
      reason: guard?.reason ?? null,
      message: guard?.message ?? "",
    },
    balanceSheet: sourcedFields
      ? {
          fromFilings: sourcedFields.usesSEC,
          financialDebt: sourcedFields.netDebt.financialDebt,
          operatingLeases: sourcedFields.netDebt.operatingLeases,
          cash: sourcedFields.netDebt.cash,
          netDebt: sourcedFields.netDebt.netDebt,
          leasesCapitalised: sourcedFields.netDebt.includesLeases,
          sharesOutstanding: sourcedFields.sharesOutstanding.value,
          caveats,
          marketCapAgrees: sourcedFields.marketCapCheck?.agrees ?? null,
          unresolvedFields: sourcedFields.unresolved,
          shareCount: {
            basis: sourcedFields.shareCount.basis,
            filed: sourcedFields.shareCount.filed,
            impliedFromMarketCap: sourcedFields.shareCount.implied,
            deviation: sourcedFields.shareCount.deviation,
            splitLike: sourcedFields.shareCount.splitLike,
          },
        }
      : null,
    scenarios: entries,
    simulation: monteCarlo
      ? {
          runs: monteCarlo.simulations.length,
          mean: monteCarlo.mean,
          median: monteCarlo.median,
          p10: monteCarlo.p10,
          p25: monteCarlo.p25,
          p75: monteCarlo.p75,
          p90: monteCarlo.p90,
          probabilityAbovePrice: monteCarlo.probabilityAbovePrice,
        }
      : null,
    // Dropped outright when the valuation is not usable, rather than exported
    // with a caveat beside it: a downstream reader parsing this file will take
    // `decision.signal` at face value.
    decision:
      guard && !guard.usable
        ? null
        : conviction && stress && zones
        ? {
            signal: conviction.signal,
            score: conviction.score,
            suggestedPosition: conviction.positionSize,
            measuredAgainst: scoreReference
              ? {
                  basis: "weighted-scenarios",
                  intrinsicValuePerShare: scoreReference.intrinsicValuePerShare,
                  upside: scoreReference.upside,
                }
              : null,
            stressCase: { value: stress.value, boundBy: stress.source },
            entryZone: {
              low: zones.entryLow,
              high: zones.entryHigh,
              trim: zones.trim,
              relevant: zones.relevant,
              gapToPrice: zones.gapToPrice,
            },
            factors: conviction.factors.map((factor) => ({
              label: factor.label,
              raw: factor.raw,
              points: factor.points,
              maxPoints: factor.maxPoints,
            })),
          }
        : null,
    warnings,
    ...(revenueBase ? { revenueBase } : {}),
    integrity: {
      companyFactsChecked: COMPANY_FACT_KEYS,
      divergences,
    },
  };
}

/** `LULU-dcf-2026-09-01.json` - sorts by company, then by when it was taken. */
export function scenarioExportFilename(
  ticker: string,
  now: Date = new Date()
): string {
  return `${ticker.toUpperCase()}-dcf-${now.toISOString().slice(0, 10)}.json`;
}
