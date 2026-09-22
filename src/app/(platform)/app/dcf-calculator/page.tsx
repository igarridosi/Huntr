"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { assessValuation } from "@/lib/calculations/dcf-currency";
import {
  buildScenarioExport,
  scenarioExportFilename,
} from "@/lib/calculations/dcf-export";
import { Calculator, ChevronDown, Download, FolderOpen, PanelRightClose, PanelRightOpen, RotateCcw, Save, Search, Trash2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { DataHuntingLoader } from "@/components/stock/data-hunting-loader";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { DCFTickerInput } from "@/components/dcf/dcf-ticker-input";
import dynamic from "next/dynamic";
import type { EPSMultipleInputs } from "@/components/dcf/eps-multiple-model";
import { DCFAssumptions } from "@/components/dcf/dcf-assumptions";
import { DCFResults } from "@/components/dcf/dcf-results";
import { DCFProjectionTable } from "@/components/dcf/dcf-projection-table";
import { DCFSensitivity } from "@/components/dcf/dcf-sensitivity";
import { Skeleton } from "@/components/ui/skeleton";
import { PositionDecisionEngine } from "@/components/dcf/position-decision-engine";
import {
  useStockQuote,
  useStockProfile,
  useFinancials,
} from "@/hooks/use-stock-data";
import { useSupabase } from "@/providers/supabase-provider";
import { useAuthGate } from "@/providers/auth-gate-provider";
import { useDCFScenarios } from "@/hooks/use-dcf-scenarios";
import {
  runDCF,
  runMonteCarlo,
  generateDCFScenarios,
  calculateCAGR,
  buildSimulationBundle,
  DEFAULT_MC_WEIGHTS,
  DEFAULT_GROWTH_MARGIN_CORRELATION,
  DEFAULT_CONVICTION_WEIGHTS,
} from "@/lib/calculations";
import type {
  DCFInputs,
  DCFResult,
  DCFScenarioKey,
  DCFScenarioSet,
  WACCEstimate,
  ConvictionWeights,
  MonteCarloWeights,
} from "@/lib/calculations";
import { cn, formatCurrency, formatCompactNumber } from "@/lib/utils";
import { useSettledValue } from "@/hooks/use-settled-value";
import { useFitToViewport } from "@/hooks/use-fit-to-viewport";
import { useSECFundamentals } from "@/hooks/use-stock-data";
import {
  applySourcedBalanceSheet,
  buildSourcedFields,
  readCompanyFacts,
  type ZeroSuspectField,
} from "@/lib/calculations/dcf-inputs-source";
import {
  adjustFCFForLeases,
  buildNetDebt,
  resolveLeaseTreatment,
} from "@/lib/api/sec-edgar";
import { DCFDataSources } from "@/components/dcf/dcf-data-sources";
import { DCFDiagnostics, countDiagnostics } from "@/components/dcf/dcf-diagnostics";
import { DCFScenarioTable } from "@/components/dcf/dcf-scenario-table";
import { ReverseDCFPanel } from "@/components/dcf/reverse-dcf-panel";
import { DCFTornado } from "@/components/dcf/dcf-tornado";
import type { SensitivityAxes } from "@/lib/calculations/dcf-transparency";
import {
  buildHistoricalBand,
  collectAnchorWarnings,
} from "@/lib/calculations/dcf-anchors";
import { collectCoherenceWarnings } from "@/lib/calculations/dcf-scenario-coherence";
import { liveFacts, withCompanyFacts } from "@/lib/dcf/live-price";
import { looksLikeLender } from "@/lib/dcf/business-model";
import { shareCountAlert } from "@/lib/dcf/share-count";
import { basisOf, revenueBaseDivergence, revenueBases, type RevenueBasis } from "@/lib/dcf/revenue-base";
import { RevenueBasePicker } from "@/components/dcf/revenue-base-picker";
import { sbcTreatment } from "@/lib/dcf/sbc-treatment";
import { statementFreeCashFlow } from "@/lib/dcf/free-cash-flow";
import { engineInputsFor, interestAddBack, type CashFlowBasis } from "@/lib/dcf/cash-flow-basis";
import { buildProvenance } from "@/lib/dcf/provenance";
import { valuationGate } from "@/lib/dcf/gate";
import { DCFProvenance } from "@/components/dcf/dcf-provenance";
import { ValuationCover } from "@/components/dcf/valuation-cover";
import { DCFRegime } from "@/components/dcf/dcf-regime";
import { debtPaydown, detectRegimes, PERIMETER_MONTHS } from "@/lib/dcf/regime";
import { buildMarginHistory } from "@/lib/calculations/margin-history";
import { track } from "@/lib/analytics/track";

// None of these four is on screen before a ticker is loaded, and three of
// them pull Recharts in. Loading them after hydration keeps that chunk off
// the route's first load.
const DCFMonteCarlo = dynamic(
  () => import("@/components/dcf/dcf-monte-carlo").then((m) => m.DCFMonteCarlo),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);
const DCFFCFChart = dynamic(
  () => import("@/components/dcf/dcf-fcf-chart").then((m) => m.DCFFCFChart),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> }
);
const EPSMultipleModel = dynamic(
  () => import("@/components/dcf/eps-multiple-model").then((m) => m.EPSMultipleModel),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full" /> }
);
const CapitalAllocatorModel = dynamic(
  () => import("@/components/dcf/capital-allocator-model").then((m) => m.CapitalAllocatorModel),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full" /> }
);

const MODEL_TABS = [
  { key: "dcf", label: "DCF Model" },
  // Sits next to the forward model on purpose: it reads the same assumptions
  // and answers the opposite question.
  { key: "reverse", label: "Reverse DCF" },
  { key: "eps", label: "EPS Multiple" },
  { key: "capital", label: "Capital Allocator" },
] as const;

const DEFAULT_INPUTS: DCFInputs = {
  baseRevenue: 0,
  baseFCFMargin: 0.2,
  growthRatePhase1: 0.1,
  growthRatePhase2: 0.04,
  yearsPhase1: 5,
  yearsPhase2: 5,
  terminalFCFMargin: 0.22,
  wacc: 0.1,
  terminalGrowthRate: 0.025,
  totalDebt: 0,
  cashAndEquivalents: 0,
  sharesOutstanding: 1,
  currentPrice: 0,
};

const DEFAULT_EPS_INPUTS: EPSMultipleInputs = {
  eps: 0,
  growth: 0.12,
  targetPE: 20,
  targetReturn: 0.15,
};

export default function DcfCalculatorPage() {
  const [modelType, setModelType] = useState<(typeof MODEL_TABS)[number]["key"]>("dcf");
  /**
   * Whether the findings column is on screen.
   *
   * Hiding it gives the results the width back rather than leaving a gap, so
   * this is a layout switch and not a visibility one - the middle column grows
   * from five twelfths to nine.
   */
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  /**
   * The two pinned columns end where the screen does.
   *
   * A `calc(100vh - 2rem)` cap is only correct once a sticky panel is actually
   * stuck: before that it starts partway down the page and overflows the fold
   * by its own offset, which is what left the assumptions running off the
   * bottom at the top of the page.
   */
  const { ref: assumptionsColumnRef, maxHeight: assumptionsMaxHeight } =
    useFitToViewport<HTMLDivElement>();
  const { ref: diagnosticsColumnRef, maxHeight: diagnosticsMaxHeight } =
    useFitToViewport<HTMLDivElement>();
  const [ticker, setTicker] = useState("");
  const [inputs, setInputs] = useState<DCFInputs>(DEFAULT_INPUTS);
  const [epsInputs, setEpsInputs] = useState<EPSMultipleInputs>(DEFAULT_EPS_INPUTS);
  const [capitalProjectionYears, setCapitalProjectionYears] = useState<5 | 10>(10);
  const [capitalRevenueGrowth, setCapitalRevenueGrowth] = useState(0.1);
  const [ocfMargin, setOcfMargin] = useState(0.28);
  const [capexMargin, setCapexMargin] = useState(0.08);
  const [capitalWacc, setCapitalWacc] = useState(0.1);
  const [waccEstimate, setWaccEstimate] = useState<WACCEstimate | null>(null);
  const [scenarios, setScenarios] = useState<DCFScenarioSet | null>(null);
  const [activeScenario, setActiveScenario] = useState<DCFScenarioKey>("base");
  // How likely each scenario is, and how tightly growth and margin move
  // together. Both feed the simulation and both are the user's to disagree with.
  const [scenarioWeights, setScenarioWeights] = useState<MonteCarloWeights>(DEFAULT_MC_WEIGHTS);
  const [growthMarginCorrelation, setGrowthMarginCorrelation] = useState(
    DEFAULT_GROWTH_MARGIN_CORRELATION
  );
  const [convictionWeights, setConvictionWeights] = useState<ConvictionWeights>(
    DEFAULT_CONVICTION_WEIGHTS
  );
  // Leases are expensed, not capitalised, by default. Under ASC 842 the rent
  // is already out of operating cash flow, so adding the liability to net debt
  // as well would discount the same obligation twice. Stock compensation is
  // off by default because it changes the headline margin and should be a
  // deliberate act.
  const [includeLeases, setIncludeLeases] = useState(false);
  const [deductSBC, setDeductSBC] = useState(false);
  /**
   * Balance-sheet figures the user supplied, including confirmed zeros.
   *
   * A figure nobody could find is not a figure, and the only two things that
   * resolve it are someone typing the number or someone vouching for the
   * zero. Both arrive here. Cleared with the ticker, since they are statements
   * about one company.
   */
  const [balanceOverrides, setBalanceOverrides] = useState<
    Partial<Record<ZeroSuspectField, number>>
  >({});
  /**
   * Which share count to divide by, once the reader has chosen one.
   *
   * Undefined means "whatever reconciles", which is the implied count when the
   * filing disagrees with the market cap. A statement about one company, so it
   * clears with the ticker.
   */
  const [shareCountBasis, setShareCountBasis] = useState<
    "filings" | "implied" | undefined
  >(undefined);

  /**
   * Which revenue the projection starts from. Null until the reader
   * chooses: the trailing twelve months whenever a quarter has been
   * reported past the last closed year, the closed year otherwise. Clears
   * with the ticker.
   */
  const [revenueBasisChoice, setRevenueBasisChoice] = useState<RevenueBasis | null>(null);
  /** Set when the SBC switch found the slider already at a post-SBC margin and refused to deduct twice. */
  const [sbcNotice, setSbcNotice] = useState<string | null>(null);
  /** Unlevered by default: after-tax interest added back, net debt subtracted. Levered runs without net debt. */
  const [cashFlowBasis, setCashFlowBasis] = useState<CashFlowBasis>("unlevered");
  /** The reader confirmed the revenue base in use describes today's perimeter (after a >10% divergence). */
  const [perimeterConfirmed, setPerimeterConfirmed] = useState(false);
  /** The reader read the failed checks and asked for the value anyway. */
  const [valueUncovered, setValueUncovered] = useState(false);
  const [sensitivityAxes, setSensitivityAxes] = useState<SensitivityAxes>("financial");
  const [isPopulated, setIsPopulated] = useState(false);
  const [isSavedMenuOpen, setIsSavedMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const animationRef = useRef<number | null>(null);
  const { user } = useSupabase();
  const { openGate } = useAuthGate();
  const { savedScenarios, isLoading: savedScenariosLoading, saveScenario, deleteScenario } = useDCFScenarios();

  const {
    data: quote,
    isLoading: quoteLoading,
    isFetching: quoteFetching,
  } = useStockQuote(ticker);
  const {
    data: profile,
    isLoading: profileLoading,
    isFetching: profileFetching,
  } = useStockProfile(ticker);
  const {
    data: financials,
    isLoading: financialsLoading,
    isFetching: financialsFetching,
  } = useFinancials(ticker);

  /**
   * The filings, but only while they describe the company on screen.
   *
   * Every query here is keyed by ticker, so in principle this can never
   * disagree. In practice the assumption panel kept showing the previous
   * company's anchor warnings after a switch, and "in principle" is not
   * something a number on screen should rest on. The payload names the
   * company it describes, so the check is free and the class of staleness
   * stops being possible rather than being unlikely.
   */
  const companyFinancials = useMemo(() => {
    if (!financials || !ticker) return null;
    return financials.ticker?.toUpperCase() === ticker.toUpperCase()
      ? financials
      : null;
  }, [financials, ticker]);

  const bases = useMemo(() => revenueBases(companyFinancials), [companyFinancials]);
  const revenueDivergence = useMemo(() => revenueBaseDivergence(bases), [bases]);
  const revenueBasis: RevenueBasis = revenueBasisChoice ?? bases.recommended ?? "manual";
  const revenueBaseRecord = useMemo(() => {
    const option = revenueBasis === "ttm" ? bases.ttm : revenueBasis === "fiscal_year" ? bases.fiscalYear : null;
    return {
      basis: revenueBasis,
      value: inputs.baseRevenue,
      periodStart: option?.periodStart ?? null,
      periodEnd: option?.periodEnd ?? null,
      periods: option?.periods ?? null,
    };
  }, [revenueBasis, bases, inputs.baseRevenue]);

  /**
   * True while the inputs are travelling towards a scenario's stored values.
   *
   * The effect below writes the live inputs back into whichever scenario is
   * active. That is right for a slider, and wrong for the frames just after a
   * scenario switch: `activeScenario` changes immediately while `inputs` is
   * still mid-flight from the previous one, so the effect wrote the *old*
   * scenario's assumptions into the newly selected one. Clicking "Bear" on
   * ServiceNow replaced its 9.0% growth and 11.5% WACC with Base's 7.3% and
   * 10.5% - a scenario silently overwritten by looking at it.
   */
  const [isAnimating, setIsAnimating] = useState(false);

  const animateInputsTo = useCallback((target: DCFInputs, duration = 380) => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    setIsAnimating(true);

    const startValues = { ...inputs };
    const startTime = performance.now();
    const numericKeys = Object.keys(target) as (keyof DCFInputs)[];

    const step = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(1, elapsed / duration);
      // Ease out cubic for smoother finish
      const eased = 1 - Math.pow(1 - t, 3);

      const next: DCFInputs = { ...startValues };
      for (const key of numericKeys) {
        const from = startValues[key] as number;
        const to = target[key] as number;
        const value = from + (to - from) * eased;
        const shouldRound = key === "yearsPhase1" || key === "yearsPhase2";
        next[key] = (shouldRound ? Math.round(value) : value) as never;
      }

      setInputs(next);

      if (t < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        setInputs(target);
        animationRef.current = null;
        setIsAnimating(false);
      }
    };

    animationRef.current = requestAnimationFrame(step);
  }, [inputs]);

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Auto-populate from real financials
  // Balance-sheet figures from the filings, with Yahoo as the fallback. Keyed
  // on the ticker, so switching company cannot leave last one numbers behind.
  const { data: secFundamentals, isFetching: secFetching } = useSECFundamentals(ticker);

  const sourcedFields = useMemo(() => {
    if (!quote) return null;

    // The Yahoo fallback reads the balance sheet directly, not the inputs.
    //
    // It used to read inputs.totalDebt and inputs.cashAndEquivalents,
    // which are the very fields populate writes back from this result. At
    // populate time those are still the zeroed defaults, so a company whose
    // debt concept EDGAR could not resolve fell through to a fallback of zero
    // and reported it as a real figure from Yahoo. Afterwards the panel was
    // reading whatever had been written into inputs while the engine kept its
    // own copy, and the two drifted apart the moment the lease toggle moved.
    const latestBalance = (companyFinancials?.balance_sheet.annual ?? [])
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .at(-1);

    return buildSourcedFields({
      sec: secFundamentals ?? null,
      yahoo: {
        sharesOutstanding: quote.shares_outstanding,
        totalDebt: latestBalance?.long_term_debt ?? null,
        cash: latestBalance?.cash_and_equivalents ?? null,
      },
      price: quote.price,
      reportedMarketCap: quote.market_cap,
      includeLeases,
      overrides: balanceOverrides,
      // One criterion: the diluted count of the latest 10-Q. The market-cap
      // cross-check reports how far it drifts and which way; it does not
      // switch the denominator on its own.
      shareCountBasis: shareCountBasis ?? "filings",
    });
  }, [
    quote,
    secFundamentals,
    companyFinancials,
    includeLeases,
    balanceOverrides,
    shareCountBasis,
  ]);

  const handleBalanceOverride = useCallback(
    (field: ZeroSuspectField, value: number | null) => {
      setBalanceOverrides((previous) => {
        if (value === null) {
          const next = { ...previous };
          delete next[field];
          return next;
        }
        return { ...previous, [field]: value };
      });
    },
    []
  );

  // Whether capitalising leases is even on offer. Without the rent charge
  // there is no way to make the compensating move, and applying only half of
  // the treatment is the one combination that is definitely wrong.
  const leaseTreatment = useMemo(
    () =>
      resolveLeaseTreatment(
        sourcedFields?.netDebt.operatingLeases ?? 0,
        secFundamentals?.operatingLeaseExpense?.value ?? null
      ),
    [sourcedFields, secFundamentals]
  );

  /**
   * Applies a company-level change to the live inputs and all three scenarios.
   *
   * The balance sheet, the share count and the revenue base are facts about
   * one company, so a treatment that changes any of them - capitalising
   * leases, deducting stock compensation, the filings arriving late - has to
   * reach every scenario or the three stop being comparable.
   *
   * This is the structural half of the fix. The effect below writes the live
   * inputs back into whichever scenario is active, which is right for an
   * assumption and wrong for a fact: a fact written that way landed on the
   * active scenario alone and left the other two holding the balance sheet
   * from populate time. That is how ServiceNow exported net debt of -2.24B on
   * Base against +2.93B on Bear and Bull, and why the earlier per-handler
   * fixes did not hold - each one fixed the live copy, which was never the
   * part that diverged. Routing every such change through one function means
   * there is no longer a code path that can apply one to a single scenario.
   *
   * The transform runs per scenario with that scenario's own inputs, so a
   * treatment whose size depends on an assumption - the lease add-back is
   * capitalised at each scenario's own spread - stays correct for each.
   */
  const applyAccountingTreatment = useCallback(
    (transform: (previous: DCFInputs) => DCFInputs) => {
      setInputs((previous) => transform(previous));
      setScenarios((previous) =>
        previous
          ? {
              ...previous,
              bear: { ...previous.bear, inputs: transform(previous.bear.inputs) },
              base: { ...previous.base, inputs: transform(previous.base.inputs) },
              bull: { ...previous.bull, inputs: transform(previous.bull.inputs) },
            }
          : previous
      );
    },
    []
  );

  /**
   * Keeps the engine's copy of the balance sheet equal to the panel's.
   *
   * Two things change these figures after populate: the filings arriving on a
   * second request, and the user supplying a figure that could not be found.
   * Both move `sourcedFields`, and neither of them moves `inputs` on its own,
   * so without this the panel and the value bridge drift apart - which is the
   * BUG A failure again, arriving by a different door. Keying on the content
   * rather than on the ticker means any later source of change is covered too.
   *
   * Idempotent by construction: re-applying the same figures is a no-op, and
   * the signature stops it running at all when nothing moved.
   */
  const [appliedSignature, setAppliedSignature] = useState<string | null>(null);
  const factsSignature =
    isPopulated && sourcedFields
      ? JSON.stringify([
          ticker,
          sourcedFields.netDebt.financialDebt,
          sourcedFields.netDebt.operatingLeases,
          sourcedFields.netDebt.cash,
          sourcedFields.netDebt.includesLeases,
          sourcedFields.sharesOutstanding.value,
        ])
      : null;
  // Applied while rendering rather than in an effect. The React Compiler
  // rejects synchronous setState in an effect body, and it has a point: an
  // effect would let one frame paint with the panel and the engine disagreeing
  // before correcting itself. Adjusting during render re-renders immediately
  // and that frame never reaches the screen. The signature in state is what
  // makes it converge - the second pass finds them equal and does nothing.
  if (factsSignature !== null && factsSignature !== appliedSignature && sourcedFields) {
    setAppliedSignature(factsSignature);
    applyAccountingTreatment((previous) =>
      applySourcedBalanceSheet(previous, sourcedFields)
    );
  }

  // One source of truth for the balance sheet.
  //
  // Whatever the panel shows is what the engine values. Populate applies it
  // once, and this keeps it applied when the lease toggle changes the total
  // afterwards - previously the toggle moved the panel and left the valuation
  // behind, so the value bridge and the breakdown printed different net debt
  // on the same screen.
  const handleIncludeLeasesChange = useCallback(
    (next: boolean) => {
      setIncludeLeases(next);
      if (!sourcedFields) return;

      const rebuilt = buildNetDebt({
        financialDebt: sourcedFields.netDebt.financialDebt,
        operatingLeases: sourcedFields.netDebt.operatingLeases,
        cash: sourcedFields.netDebt.cash,
        includeLeases: next,
      });

      applyAccountingTreatment((previous) => {
        const revenue = previous.baseRevenue;

        // The interest the capitalised liability no longer costs in rent,
        // expressed as margin points.
        const addBack =
          adjustFCFForLeases({
            freeCashFlow: 0,
            leaseExpense: leaseTreatment.leaseExpense,
            leaseLiability: rebuilt.operatingLeases,
            // The spread, not the WACC. The add-back is a stream the model
            // capitalises at (WACC - g), so charging it at the full WACC
            // credits back more than the liability it is offsetting: on
            // Starbucks, 732M a year is worth 13.3B against a 9.2B lease
            // balance, and the toggle moved the valuation +10% instead of
            // leaving it roughly where it was.
            discountRate: previous.wacc - previous.terminalGrowthRate,
            capitalise: true,
          }) / Math.max(1, revenue);

        // Applied to both margins, and reversed on the way back.
        //
        // Shifting only the starting margin does not compensate: the model
        // interpolates from it to the terminal margin, so an add-back on the
        // near end decays to nothing by the terminal year - which is where
        // most of the value lives - while the whole lease liability lands on
        // net debt regardless. That asymmetry moved Starbucks by 11.5% when
        // the two treatments should agree within a few points. And because
        // the un-capitalise path previously left the margin where it was,
        // toggling twice returned a different number than it started with.
        const shift = next ? addBack : -addBack;

        return {
          ...previous,
          totalDebt:
            rebuilt.financialDebt +
            (rebuilt.includesLeases ? rebuilt.operatingLeases : 0),
          cashAndEquivalents: rebuilt.cash,
          baseFCFMargin: revenue > 0 ? previous.baseFCFMargin + shift : previous.baseFCFMargin,
          terminalFCFMargin:
            revenue > 0 ? previous.terminalFCFMargin + shift : previous.terminalFCFMargin,
        };
      });
    },
    [sourcedFields, leaseTreatment, applyAccountingTreatment]
  );

  // Toggling stock compensation has to move the model, not just the display.
  // Done in the handler rather than an effect watching the flag: the two
  // always change together, and an effect would cost a second render and a
  // frame where the panel and the valuation disagree.
  const handleDeductSBCChange = useCallback(
    (next: boolean) => {
      setDeductSBC(next);
      const sbc = sourcedFields?.shareBasedCompensation.value ?? 0;
      if (sbc <= 0) return;
      if (!next) setSbcNotice(null);

      // The statements' own margin, before SBC: what the deduction is taken
      // from when the slider already stands at a deducted level.
      const latestCashFlow = [...(companyFinancials?.cash_flow.annual ?? [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      const statementFcf = latestCashFlow ? statementFreeCashFlow(latestCashFlow, "annual").value : null;

      applyAccountingTreatment((previous) => {
        if (previous.baseRevenue <= 0) return previous;
        const sbcMargin = sbc / previous.baseRevenue;
        if (next && statementFcf !== null) {
          const treatment = sbcTreatment({ currentMargin: previous.baseFCFMargin, rawMargin: statementFcf / previous.baseRevenue, sbcMargin });
          if (treatment.alreadyDeducted) {
            // Once, from the statements, not again from a slider that has
            // already had it taken off.
            setSbcNotice(treatment.warning);
            return { ...previous, baseFCFMargin: treatment.deductedMargin };
          }
        }
        // Deducting subtracts it once; restoring adds the same amount back, so
        // flipping the toggle twice returns to exactly where it started.
        const shift = next ? -sbcMargin : sbcMargin;
        return { ...previous, baseFCFMargin: previous.baseFCFMargin + shift };
      });
    },
    [sourcedFields, applyAccountingTreatment, companyFinancials]
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
  const revenueHistory = useMemo(() => {
    const annual = companyFinancials?.income_statement.annual ?? [];
    if (annual.length < 2) {
      return { cagr5: null, cagr10: null, fcfMargin5: null, marginHistory: null, lender: false };
    }

    const sortedIncomeRows = annual
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const revenues = sortedIncomeRows.map((row) => row.revenue).filter((v) => v > 0);

    const cashFlows = (companyFinancials?.cash_flow.annual ?? [])
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    /**
     * Paired by fiscal year, and judged before it is offered as a benchmark.
     *
     * This used to divide `cashFlows.slice(-5)[i]` by `revenues[len-5+i]` -
     * position against position. The two statements do not always cover the
     * same years, so that quietly divided one year's cash flow by another
     * year's revenue and produced a margin belonging to neither. It also read
     * a precomputed `free_cash_flow` field whose definition we do not control,
     * while the anchor bands two hundred lines away computed it as operating
     * cash flow less capex. Two definitions of one metric in one file.
     */
    // The "not a usable margin record" rule is a sector rule inside
    // buildMarginHistory, and Yahoo's "Financial Services" holds S&P Global
    // and Visa next to SoFi. The sector is passed only when the business
    // itself looks like a lender — an unclassified balance sheet with thin
    // equity, or an industry that names banking, insurance or lending.
    const latestBalanceRow = [...(companyFinancials?.balance_sheet.annual ?? [])]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .at(-1);
    const lender = looksLikeLender({ industry: profile?.industry, balance: latestBalanceRow ?? null, income: sortedIncomeRows.at(-1) ?? null });
    const marginHistory = buildMarginHistory({
      revenues: sortedIncomeRows,
      cashFlows,
      sector: lender ? profile?.sector : null,
      years: 5,
    });

    return {
      cagr5: calculateCAGR(revenues, 5),
      cagr10: calculateCAGR(revenues, 10),
      fcfMargin5: marginHistory.median,
      marginHistory,
      lender,
    };
  }, [companyFinancials, profile?.sector, profile?.industry]);

  /** After-tax interest over revenue, from the latest annual income statement: what unlevering adds back. */
  const addBack = useMemo(
    () => interestAddBack([...(companyFinancials?.income_statement.annual ?? [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1)),
    [companyFinancials]
  );

  // The realised ranges drawn under the sliders, and the checks that compare
  // the assumptions against them.
  const anchorContext = useMemo(() => {
    const annual = companyFinancials?.income_statement.annual ?? [];
    const cashFlows = companyFinancials?.cash_flow.annual ?? [];

    const sortedIncome = annual
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedCash = cashFlows
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const revenues = sortedIncome.map((row) => row.revenue);
    const yoyGrowth = revenues
      .slice(1)
      .map((revenue, index) =>
        revenues[index] > 0 ? revenue / revenues[index] - 1 : Number.NaN
      )
      .filter((value) => Number.isFinite(value))
      .slice(-5);

    // Revenue keyed by fiscal year, not by array position.
    //
    // These two statements do not always cover the same years, so lining them
    // up by index silently paired a cash flow with the wrong year revenue -
    // which is how the margin band came out at 19.8-30.0% for a company whose
    // real FCF margin was around 8%. A band that reports a different metric
    // than the slider it sits under is worse than no band: it flags a correct
    // assumption as being outside the record, and a warning that is
    // mechanically right and factually false teaches people to ignore all of
    // them.
    const revenueByYear = new Map<string, number>();
    for (const row of sortedIncome) {
      revenueByYear.set(row.date.slice(0, 4), row.revenue);
    }

    // Computed the way the model defines it - operating cash flow less capex -
    // rather than read from a precomputed field. Most of the margin fields on
    // offer refer to a different metric entirely.
    const marginRows = sortedCash.slice(-5).map((row) => {
      const revenue = revenueByYear.get(row.date.slice(0, 4)) ?? 0;
      if (!(revenue > 0)) return null;
      const freeCashFlow =
        row.operating_cash_flow - Math.abs(row.capital_expenditures);
      return {
        margin: freeCashFlow / revenue,
        capexRatio: Math.abs(row.capital_expenditures) / revenue,
      };
    });

    const margins = marginRows
      .filter((row): row is { margin: number; capexRatio: number } => row !== null)
      .map((row) => row.margin)
      .filter((value) => Number.isFinite(value));

    const capexRatios = marginRows
      .filter((row): row is { margin: number; capexRatio: number } => row !== null)
      .map((row) => row.capexRatio)
      .filter((value) => Number.isFinite(value));

    const capexToRevenue = capexRatios.at(-1) ?? null;
    // Direction over the window, not a single year: one heavy year of capex is
    // not a trend.
    const capexTrend =
      capexRatios.length >= 2
        ? (capexRatios.at(-1) as number) - capexRatios[0]
        : null;

    const bands = {
      growthPhase1: buildHistoricalBand(yoyGrowth, inputs.growthRatePhase1),
      baseMargin: buildHistoricalBand(margins, inputs.baseFCFMargin),
      terminalMargin: buildHistoricalBand(margins, inputs.terminalFCFMargin),
    };

    const warnings = collectAnchorWarnings({
      growthPhase1: inputs.growthRatePhase1,
      baseMargin: inputs.baseFCFMargin,
      terminalMargin: inputs.terminalFCFMargin,
      growthBand: bands.growthPhase1,
      capexToRevenue,
      capexTrend,
    });

    return { bands, warnings };
  }, [companyFinancials, inputs.growthRatePhase1, inputs.baseFCFMargin, inputs.terminalFCFMargin]);

  const handlePopulate = useCallback(() => {
    if (!quote || !companyFinancials) return;

    const generated = generateDCFScenarios({
      quote,
      financials: companyFinancials,
      sector: profile?.sector,
    });

    if (!generated) return;

    // The generator produced the operating assumptions; the balance sheet is
    // not an assumption, so the filed figures replace it in all three
    // scenarios at once.
    const sourced = sourcedFields
      ? {
          bear: { ...generated.bear, inputs: applySourcedBalanceSheet(generated.bear.inputs, sourcedFields) },
          base: { ...generated.base, inputs: applySourcedBalanceSheet(generated.base.inputs, sourcedFields) },
          bull: { ...generated.bull, inputs: applySourcedBalanceSheet(generated.bull.inputs, sourcedFields) },
          waccEstimate: generated.waccEstimate,
        }
      : generated;

    // The generator starts from the last closed fiscal year. The base in
    // use is the trailing twelve months whenever quarters have been
    // reported since — Celsius' closed 2025 was 21% short of the twelve
    // months to June 2026, and every projected flow with it — on all
    // three scenarios, so the reverse DCF and the export read the same
    // figure as the sliders.
    const chosen = bases.recommended === "ttm" ? bases.ttm : bases.fiscalYear;
    const revenued = chosen
      ? withCompanyFacts(sourced, { ...readCompanyFacts(sourced.base.inputs), baseRevenue: chosen.value })
      : sourced;
    setRevenueBasisChoice(null);
    // The statements' free cash flow is levered (after interest); the model
    // subtracts net debt, so the flows it runs on are unlevered: after-tax
    // interest goes back on the margins of all three scenarios.
    const points = addBack?.marginPoints ?? 0;
    const unlever = (i: DCFInputs): DCFInputs => ({ ...i, baseFCFMargin: i.baseFCFMargin + points, terminalFCFMargin: i.terminalFCFMargin + points });
    const based = {
      ...revenued,
      bear: { ...revenued.bear, inputs: unlever(revenued.bear.inputs) },
      base: { ...revenued.base, inputs: unlever(revenued.base.inputs) },
      bull: { ...revenued.bull, inputs: unlever(revenued.bull.inputs) },
    };
    setCashFlowBasis("unlevered");
    setPerimeterConfirmed(false);
    setValueUncovered(false);

    setScenarios(based);
    setActiveScenario("base");
    setWaccEstimate(based.waccEstimate);
    animateInputsTo(based.base.inputs, 420);
    setIsPopulated(true);

    const annualIncome = companyFinancials.income_statement.annual
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const annualCashFlow = companyFinancials.cash_flow.annual
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const latestIncome = annualIncome.at(-1);
    const latestCashFlow = annualCashFlow.at(-1);

    const projectedYears = generated.base.inputs.yearsPhase1 + generated.base.inputs.yearsPhase2;
    setCapitalProjectionYears(projectedYears >= 8 ? 10 : 5);
    setCapitalRevenueGrowth(Math.max(-0.1, Math.min(0.5, generated.base.inputs.growthRatePhase1)));
    setCapitalWacc(Math.max(0.04, Math.min(0.25, generated.base.inputs.wacc)));

    if (latestIncome && latestIncome.revenue > 0 && latestCashFlow) {
      const nextOcfMargin = Math.max(0.05, Math.min(0.7, latestCashFlow.operating_cash_flow / latestIncome.revenue));
      const nextCapexMargin = Math.max(0.01, Math.min(0.35, Math.abs(latestCashFlow.capital_expenditures) / latestIncome.revenue));
      setOcfMargin(nextOcfMargin);
      setCapexMargin(nextCapexMargin);
    } else {
      const fallbackOcfMargin = Math.max(0.08, Math.min(0.65, generated.base.inputs.baseFCFMargin + 0.08));
      const fallbackCapexMargin = Math.max(0.01, Math.min(0.35, fallbackOcfMargin - generated.base.inputs.baseFCFMargin));
      setOcfMargin(fallbackOcfMargin);
      setCapexMargin(fallbackCapexMargin);
    }
  }, [quote, companyFinancials, profile, animateInputsTo, sourcedFields, bases, addBack]);

  /** Switching basis moves the after-tax interest on or off the margins of all three scenarios; the engine follows. */
  const handleCashFlowBasisChange = useCallback(
    (next: CashFlowBasis) => {
      if (next === cashFlowBasis) return;
      setCashFlowBasis(next);
      const points = addBack?.marginPoints ?? 0;
      if (points === 0) return;
      const shift = next === "unlevered" ? points : -points;
      applyAccountingTreatment((previous) => ({ ...previous, baseFCFMargin: previous.baseFCFMargin + shift, terminalFCFMargin: previous.terminalFCFMargin + shift }));
    },
    [cashFlowBasis, addBack, applyAccountingTreatment]
  );

  /** A new revenue base goes on the live inputs and on all three scenarios at once. */
  const setRevenueBase = useCallback(
    (basis: RevenueBasis, value: number) => {
      setRevenueBasisChoice(basis);
      if (!(value > 0)) return;
      setInputs((previous) => ({ ...previous, baseRevenue: value }));
      setScenarios((previous) =>
        previous ? withCompanyFacts(previous, { ...liveFacts(previous[activeScenario].inputs, quote?.price), baseRevenue: value }) : previous
      );
    },
    [activeScenario, quote?.price]
  );

  const handleRevenueBasisChange = useCallback(
    (basis: RevenueBasis) => {
      const option = basis === "ttm" ? bases.ttm : basis === "fiscal_year" ? bases.fiscalYear : null;
      setRevenueBase(basis, option ? option.value : inputs.baseRevenue);
    },
    [bases, inputs.baseRevenue, setRevenueBase]
  );

  const handleScenarioChange = useCallback((scenario: DCFScenarioKey) => {
    if (!scenarios) return;
    setActiveScenario(scenario);
    animateInputsTo(
      {
        ...scenarios[scenario].inputs,
        // Always compare vs live quote when present.
        currentPrice: quote?.price ?? inputs.currentPrice,
      },
      420
    );
  }, [scenarios, animateInputsTo, quote?.price, inputs.currentPrice]);

  /**
   * The live inputs written back into the active scenario, during render.
   *
   * Never during a switch: what is on screen then belongs to the scenario
   * being left, not the one being entered.
   */
  const activeScenarioInputs =
    scenarios && isPopulated && !isAnimating ? scenarios[activeScenario]?.inputs : null;
  {
    /**
     * Zeroed for the *comparison* only.
     *
     * The price moves on its own, and a scenario should not be considered
     * edited because a quote ticked. But the zeroed copy used to be the one
     * written to the store as well, so every scenario that had ever been
     * active ended up holding `currentPrice: 0` - and `runDCF` returns an
     * upside of 0 when there is no price to compare against. That is the
     * whole of the "upside clamped to zero" report: THC's bear and base
     * exported 0 instead of -0.66 and -0.16, and only the active scenario
     * looked right because the export runs that one from the live inputs.
     */
    const forComparison = (scenarioInputs: DCFInputs): DCFInputs => ({
      ...scenarioInputs,
      currentPrice: 0,
    });

    const same =
      activeScenarioInputs === null ||
      JSON.stringify(forComparison(activeScenarioInputs)) ===
        JSON.stringify(forComparison(inputs));

    if (!same) {
      setScenarios((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [activeScenario]: {
            // Stored as they are, price included.
            ...prev[activeScenario],
            inputs,
          },
        };
      });
    }
  }

  const handleTickerSelect = useCallback((t: string) => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setTicker(t);
    setInputs(DEFAULT_INPUTS);
    // Both of these are statements about one company's accounts, not
    // preferences: leaving a lease capitalisation on across a switch applies
    // the previous company's treatment to the new one's balance sheet.
    setIncludeLeases(false);
    setDeductSBC(false);
    setBalanceOverrides({});
    setShareCountBasis(undefined);
    setSbcNotice(null);
    setCashFlowBasis("unlevered");
    setPerimeterConfirmed(false);
    setValueUncovered(false);
    setAppliedSignature(null);
    setScenarios(null);
    setWaccEstimate(null);
    setActiveScenario("base");
    setIsPopulated(false);
    setIsSavedMenuOpen(false);
    setSaveStatus("idle");
    setEpsInputs(DEFAULT_EPS_INPUTS);
    setCapitalProjectionYears(10);
    setCapitalRevenueGrowth(0.1);
    setOcfMargin(0.28);
    setCapexMargin(0.08);
    setCapitalWacc(0.1);
  }, []);

  const applySavedScenario = useCallback((payload: {
    ticker: string;
    scenarios: DCFScenarioSet;
    activeScenario: DCFScenarioKey;
    waccEstimate: WACCEstimate | null;
  }) => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const normalizedTicker = payload.ticker.toUpperCase();
    const selected = payload.scenarios[payload.activeScenario] ?? payload.scenarios.base;

    setTicker(normalizedTicker);
    setIncludeLeases(false);
    setDeductSBC(false);
    setBalanceOverrides({});
    setShareCountBasis(undefined);
    // Named after whichever basis the stored figure matches, so a set saved
    // on the closed year says so rather than reading as a choice.
    setRevenueBasisChoice(basisOf(selected.inputs.baseRevenue, bases));
    setAppliedSignature(null);
    // Stored with the price zeroed on every scenario, and possibly with a
    // balance sheet from an earlier session on the ones that were not active
    // then. All three take the facts of the one that opens, priced live.
    setScenarios(withCompanyFacts(payload.scenarios, liveFacts(selected.inputs, quote?.price)));
    setActiveScenario(payload.activeScenario);
    setWaccEstimate(payload.waccEstimate);
    animateInputsTo(
      {
        ...selected.inputs,
        // Always prioritize live quote when available.
        currentPrice: quote?.price ?? selected.inputs.currentPrice,
      },
      420
    );
    setIsPopulated(true);
    setIsSavedMenuOpen(false);
    setSaveStatus("idle");

    const selectedYears = selected.inputs.yearsPhase1 + selected.inputs.yearsPhase2;
    setCapitalProjectionYears(selectedYears >= 8 ? 10 : 5);
    setCapitalRevenueGrowth(Math.max(-0.1, Math.min(0.5, selected.inputs.growthRatePhase1)));
    setCapitalWacc(Math.max(0.04, Math.min(0.25, selected.inputs.wacc)));
    const baselineOcf = Math.max(0.08, Math.min(0.65, selected.inputs.baseFCFMargin + 0.08));
    const baselineCapex = Math.max(0.01, Math.min(0.35, baselineOcf - selected.inputs.baseFCFMargin));
    setOcfMargin(baselineOcf);
    setCapexMargin(baselineCapex);
  }, [animateInputsTo, quote?.price, bases]);

  // The comparison price is always the live quote, never a stored snapshot.
  // Adjusted during render: the value is a pure function of the quote.
  if (ticker && quote?.price != null && quote.price > 0 && inputs.currentPrice !== quote.price) {
    setInputs((prev) => ({ ...prev, currentPrice: quote.price }));
  }

  const handleSaveScenarios = useCallback(async () => {
    if (!ticker || !scenarios) return;
    if (!user) {
      openGate("dcf");
      return;
    }

    const sanitizeCurrentPrice = (scenarioInputs: DCFInputs): DCFInputs => ({
      ...scenarioInputs,
      // currentPrice must be evaluated in real-time, not persisted.
      currentPrice: 0,
    });

    const scenariosToSave: DCFScenarioSet = {
      ...scenarios,
      bear: {
        ...scenarios.bear,
        inputs: sanitizeCurrentPrice(scenarios.bear.inputs),
      },
      base: {
        ...scenarios.base,
        inputs: sanitizeCurrentPrice(scenarios.base.inputs),
      },
      bull: {
        ...scenarios.bull,
        inputs: sanitizeCurrentPrice(scenarios.bull.inputs),
      },
      [activeScenario]: {
        ...scenarios[activeScenario],
        inputs: sanitizeCurrentPrice(inputs),
      },
    };

    const ok = await saveScenario({
      ticker: ticker.toUpperCase(),
      scenarios: scenariosToSave,
      activeScenario,
      waccEstimate,
    });

    // The zeroed copy is for the store; what stays in memory keeps the live
    // price and the balance sheet on screen, on all three.
    setScenarios(withCompanyFacts(scenariosToSave, liveFacts(inputs, inputs.currentPrice)));
    setSaveStatus(ok ? "saved" : "error");
  }, [activeScenario, inputs, openGate, saveScenario, scenarios, ticker, user, waccEstimate]);

  const handleDeleteSavedScenario = useCallback(async (savedTicker: string) => {
    await deleteScenario(savedTicker);
  }, [deleteScenario]);

  const handlePopulateEPS = useCallback(() => {
    if (!quote || !companyFinancials) return;

    const annualIncome = companyFinancials.income_statement.annual
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const latest = annualIncome.at(-1);
    if (!latest) return;

    const epsSeries = annualIncome.map((i) => i.eps_diluted).filter((v) => v > 0);
    const epsGrowth3y = calculateCAGR(epsSeries, 3);

    setEpsInputs({
      eps: Math.max(0, latest.eps_diluted),
      growth: Math.max(-0.1, Math.min(0.35, epsGrowth3y ?? 0.12)),
      targetPE:
        quote.pe_ratio > 0
          ? Math.max(8, Math.min(40, quote.pe_ratio * 0.9))
          : 20,
      targetReturn: 0.15,
    });
  }, [quote, companyFinancials]);

  // What the engine runs on: the live inputs, or, on the levered basis,
  // the same with net debt at zero so flows after interest are never
  // also charged the debt.
  const engineInputs = useMemo(() => engineInputsFor(inputs, cashFlowBasis), [inputs, cashFlowBasis]);
  const result: DCFResult | null = useMemo(() => {
    if (engineInputs.baseRevenue <= 0 || engineInputs.sharesOutstanding <= 0) return null;
    return runDCF(engineInputs);
  }, [engineInputs]);

  // Switching scenario tweens every input over 420ms, which means a new inputs
  // object roughly 25 times in half a second. Everything downstream was
  // recomputing at that rate - a 2,000-path Monte Carlo, the sensitivity grid,
  // two Recharts trees - and no amount of easing looks smooth when the frame
  // budget is spent 25 times over. So the tween now only drives what has to
  // follow it live: the sliders and the headline figure. The heavy surfaces
  // read a settled copy that lands once the values stop moving, which also
  // covers dragging a slider by hand, not just the scenario switch.
  const settledInputs = useSettledValue(engineInputs, 130);
  const settledResult: DCFResult | null = useMemo(() => {
    if (settledInputs.baseRevenue <= 0 || settledInputs.sharesOutstanding <= 0) return null;
    return runDCF(settledInputs);
  }, [settledInputs]);
  // First tick after the model populates, the settled copy is still the empty
  // default. Falling back keeps these cards from flashing blank.
  const steadyResult = settledResult ?? result;

  // One simulation, shared.
  //
  // The Monte Carlo panel and the decision engine each used to run their own -
  // different seeds, different iteration counts - and then print the resulting
  // "probability above price" side by side as though it were one number. It was
  // two, and they disagreed on screen. Running it once here and passing the
  // result down makes that impossible.
  //
  // It is also what lets the simulation sample across bear/base/bull rather
  // than jittering around whichever scenario happens to be active, which is
  // what was hiding the downside.
  const mcScenarios = useMemo(
    () =>
      scenarios
        ? {
            bear: scenarios.bear.inputs,
            base: scenarios.base.inputs,
            bull: scenarios.bull.inputs,
          }
        : undefined,
    [scenarios]
  );

  const simulation = useMemo(() => {
    if (!steadyResult) return null;
    const monteCarlo = runMonteCarlo(settledInputs, 2000, 42, {
      scenarios: mcScenarios,
      weights: scenarioWeights,
      growthMarginCorrelation: growthMarginCorrelation,
    });
    return buildSimulationBundle({
      result: steadyResult,
      monteCarlo,
      bearInputs: scenarios?.bear.inputs,
      weights: convictionWeights,
      // The score is measured against all three, weighted, so it does not
      // change with the tab that happens to be open.
      scenarios: mcScenarios,
      scenarioWeights,
    });
  }, [
    steadyResult,
    settledInputs,
    mcScenarios,
    scenarioWeights,
    growthMarginCorrelation,
    scenarios,
    convictionWeights,
  ]);

  /**
   * The three scenarios as one JSON file.
   *
   * Reading a DCF out of this interface means scrolling a dozen panels and
   * retyping rounded figures; handing it to a model means pasting screenshots.
   * The file carries the assumptions, the outputs, the projection year by
   * year and the provenance of the balance sheet, so the analysis can happen
   * somewhere else without anything being transcribed by hand.
   */
  /**
   * Whether the model is allowed to answer, computed once and shared.
   *
   * Both the results card and the decision engine read this same verdict. They
   * used to have no notion of it, which is how one company produced a "+566%
   * upside" headline and a "Strong Buy, 8-10% of capital" recommendation from
   * a yen revenue base measured against a dollar ADR price.
   *
   * The settled result is used rather than the live one so the guard does not
   * flicker while an input animates through an implausible intermediate value.
   */
  const valuationGuard = useMemo(
    () =>
      assessValuation({
        priceCurrency: quote?.currency,
        financialCurrency: quote?.financial_currency,
        upside: (steadyResult ?? result)?.upside ?? null,
        unresolvedFields: sourcedFields?.unresolved,
      }),
    [
      quote?.currency,
      quote?.financial_currency,
      steadyResult,
      result,
      sourcedFields?.unresolved,
    ]
  );

  /**
   * Where the three scenarios contradict their own names.
   *
   * Computed from the live inputs for the active scenario, so a slider moved
   * into an incoherent position says so immediately rather than at the next
   * scenario switch.
   */
  const coherenceWarnings = useMemo(() => {
    if (!scenarios || !isPopulated) return [];
    return collectCoherenceWarnings({
      ...scenarios,
      [activeScenario]: { ...scenarios[activeScenario], inputs },
    });
  }, [scenarios, activeScenario, inputs, isPopulated]);

  // Kept on the button that hides the column, so folding it away never hides
  // the fact that there is something in it.
  const diagnosticsCount = useMemo(
    () =>
      countDiagnostics({
        anchorWarnings: anchorContext.warnings,
        coherenceWarnings,
        fields: sourcedFields,
        notices: sbcNotice ? [sbcNotice] : [],
      }),
    [anchorContext.warnings, coherenceWarnings, sourcedFields, sbcNotice]
  );

  const latestAnnualRows = useMemo(() => {
    const byDate = <T extends { date: string }>(rows: readonly T[] | undefined) => [...(rows ?? [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
    return { cash: byDate(companyFinancials?.cash_flow.annual), income: byDate(companyFinancials?.income_statement.annual) };
  }, [companyFinancials]);

  const provenance = useMemo(
    () =>
      buildProvenance({
        inputs,
        revenue: { basis: revenueBasis, periodStart: revenueBaseRecord.periodStart, periodEnd: revenueBaseRecord.periodEnd, source: latestAnnualRows.income?.source ?? null },
        marginRows: latestAnnualRows,
        fields: sourcedFields,
        sec: secFundamentals ?? null,
        quote: quote ? { price: quote.price, marketCap: quote.market_cap, asOf: null } : null,
      }),
    [inputs, revenueBasis, revenueBaseRecord, latestAnnualRows, sourcedFields, secFundamentals, quote]
  );

  const gate = useMemo(
    () =>
      valuationGate({
        shares: inputs.sharesOutstanding,
        price: inputs.currentPrice,
        reportedMarketCap: quote?.market_cap ?? null,
        cashFlow: { annual: companyFinancials?.cash_flow.annual ?? [], quarterly: companyFinancials?.cash_flow.quarterly ?? [] },
        debtInUse: inputs.totalDebt,
        debtSource: sourcedFields?.financialDebt.source ?? null,
        filedDebt: secFundamentals?.financialDebt ?? null,
        revenue: { basis: revenueBasis, divergence: revenueDivergence, perimeterConfirmed },
        marginHistory: revenueHistory.marginHistory,
        lender: revenueHistory.lender,
      }),
    [inputs, quote?.market_cap, companyFinancials, sourcedFields, secFundamentals, revenueBasis, revenueDivergence, perimeterConfirmed, revenueHistory]
  );
  const valueCovered = isPopulated && gate.blocked && !valueUncovered;

  // One event per company once its valuation is on screen, and whether
  // the checks let the value through. The ref keeps a re-render from
  // counting the same valuation twice.
  const countedValuation = useRef<string | null>(null);
  useEffect(() => {
    if (!isPopulated || !ticker) {
      if (!isPopulated) countedValuation.current = null;
      return;
    }
    const signature = `${ticker}:${gate.blocked}`;
    if (countedValuation.current === signature) return;
    countedValuation.current = signature;
    track(gate.blocked ? "valuation_blocked" : "valuation_run", {
      ticker,
      props: gate.blocked ? { reasons: gate.reasons } : null,
    });
  }, [isPopulated, ticker, gate.blocked, gate.reasons]);

  // The regime, from the statements: capex and margin off the latest
  // fiscal year on the defined basis, leverage off EBITDA, the terminal
  // weight off the current run, the perimeter off the filings.
  const regimes = useMemo(() => {
    const cash = latestAnnualRows.cash;
    const income = latestAnnualRows.income;
    const fcf = cash ? statementFreeCashFlow(cash, "annual").value : null;
    // Measured from the latest statement on file, not the clock: a render
    // is pure, and "recent" means recent relative to the history in use.
    const asOf = latestAnnualRows.income?.date ?? latestAnnualRows.cash?.date ?? null;
    const recent = (fact: { value: number; periodEnd: string } | null | undefined) => {
      if (!fact || !(fact.value > 0) || !asOf) return null;
      const ageMonths = (Date.parse(asOf) - Date.parse(fact.periodEnd)) / (30.44 * 86_400_000);
      return ageMonths <= PERIMETER_MONTHS ? { value: fact.value, periodEnd: fact.periodEnd } : null;
    };
    return detectRegimes({
      lender: revenueHistory.lender,
      capexToRevenue: cash && income && income.revenue > 0 ? Math.abs(cash.capital_expenditures) / income.revenue : null,
      terminalWeight: result && result.enterpriseValue > 0 ? result.pvTerminalValue / result.enterpriseValue : null,
      debtToEbitda: income && income.ebitda > 0 ? inputs.totalDebt / income.ebitda : null,
      fcfMargin: fcf !== null && income && income.revenue > 0 ? fcf / income.revenue : null,
      perimeter: { divergence: revenueDivergence?.deviation ?? null, acquisitions: recent(secFundamentals?.acquisitions), divestitures: recent(secFundamentals?.divestitures) },
    });
  }, [latestAnnualRows, revenueHistory.lender, result, inputs.totalDebt, revenueDivergence, secFundamentals]);
  const paydown = useMemo(
    () => (result ? { ...debtPaydown(inputs.totalDebt, result.projections.map((p) => p.fcf)), debt: inputs.totalDebt } : null),
    [result, inputs.totalDebt]
  );

  const handleExportScenarios = useCallback(() => {
    if (!ticker || !scenarios) return;

    const payload = buildScenarioExport({
      ticker,
      companyName: profile?.name ?? null,
      currentPrice: inputs.currentPrice,
      // The company facts — revenue base, debt, cash, shares, price — are
      // what is on screen, on all three: a balance sheet that arrived after
      // a scenario was generated is not a disagreement between scenarios.
      scenarios: withCompanyFacts(
        scenarios,
        readCompanyFacts(sourcedFields ? applySourcedBalanceSheet(inputs, sourcedFields) : inputs)
      ),
      activeScenario,
      liveInputs: inputs,
      sourcedFields,
      monteCarlo: simulation?.monteCarlo ?? null,
      conviction: simulation?.conviction ?? null,
      stress: simulation?.stress ?? null,
      zones: simulation?.zones ?? null,
      scoreReference: simulation?.reference ?? null,
      revenueBase: revenueBaseRecord,
      provenance,
      cashFlowBasis: { basis: cashFlowBasis, interestAddBackPoints: addBack?.marginPoints ?? null, taxRate: addBack?.taxRate ?? null, taxRateSource: addBack?.taxRateSource ?? null },
      gate: { checks: gate.checks, blocked: gate.blocked, uncoveredByReader: gate.blocked && valueUncovered },
      regimes: regimes.map((r) => ({ id: r.id, label: r.label, detail: r.detail, recommendation: r.recommendation, tab: r.tab })),
      warnings: [
        ...gate.reasons.map((r) => `Check failed — ${r}`),
        // First, because it voids every per-share figure below it.
        ...(shareCountAlert(sourcedFields) ? [shareCountAlert(sourcedFields)!.message] : []),
        ...(revenueDivergence ? [revenueDivergence.message] : []),
        ...(sbcNotice ? [sbcNotice] : []),
        ...anchorContext.warnings.map((warning) => warning.message),
        ...coherenceWarnings.map((warning) => warning.message),
      ],
      guard: valuationGuard,
    });

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = scenarioExportFilename(ticker);
    link.click();
    URL.revokeObjectURL(url);
    track("valuation_export", { ticker, props: { basis: cashFlowBasis, blocked: gate.blocked } });
  }, [
    ticker,
    scenarios,
    activeScenario,
    inputs,
    profile?.name,
    sourcedFields,
    simulation,
    anchorContext.warnings,
    coherenceWarnings,
    valuationGuard,
    revenueDivergence,
    revenueBaseRecord,
    sbcNotice,
    provenance,
    cashFlowBasis,
    addBack,
    gate,
    valueUncovered,
    regimes,
  ]);

  const handleReset = useCallback(() => {
    setTicker("");
    setInputs(DEFAULT_INPUTS);
    setIncludeLeases(false);
    setDeductSBC(false);
    setBalanceOverrides({});
    setShareCountBasis(undefined);
    setSbcNotice(null);
    setCashFlowBasis("unlevered");
    setPerimeterConfirmed(false);
    setValueUncovered(false);
    setAppliedSignature(null);
    setEpsInputs(DEFAULT_EPS_INPUTS);
    setCapitalProjectionYears(10);
    setCapitalRevenueGrowth(0.1);
    setOcfMargin(0.28);
    setCapexMargin(0.08);
    setCapitalWacc(0.1);
    setWaccEstimate(null);
    setScenarios(null);
    setActiveScenario("base");
    setIsPopulated(false);
  }, []);

  const canPopulate = !!quote && !!companyFinancials && !isPopulated;
  const isPreparingPopulate =
    !!ticker &&
    !isPopulated &&
    !canPopulate &&
    (quoteLoading ||
      quoteFetching ||
      profileLoading ||
      profileFetching ||
      financialsLoading ||
      financialsFetching);
  const baseFCF = inputs.baseRevenue * inputs.baseFCFMargin;
  const canPopulateEPS = !!quote && !!companyFinancials;
  const normalizedTicker = ticker.toUpperCase();
  const savedForTicker = savedScenarios.find((entry) => entry.ticker === normalizedTicker);
  const canLoadSavedTicker = !!savedForTicker;

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div
        className="insight-enter flex flex-wrap items-center justify-between gap-4"
        style={{ "--enter-delay": "0ms" } as React.CSSProperties}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sunset-orange/10 ring-1 ring-inset ring-sunset-orange/20">
            <Calculator className="h-5 w-5 text-sunset-orange" />
          </div>
          <div>
            {/* Display type pulls its letters in as it grows; the label under
                it goes the other way so it reads as a caption, not a sentence. */}
            <h1 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-snow-peak">
              DCF Calculator
            </h1>
            <p className="mt-1 text-[10px] uppercase tracking-[0.09em] text-mist/60">
              Two-stage discounted cash flow intrinsic value model
            </p>
          </div>
        </div>

        {isPopulated && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>

      {/* Model toggle.
          This was three full-width bordered buttons inside their own Card — a
          container whose only content was a control, and three competing
          borders where one selection exists. A segmented control says the same
          thing in one shape, and the indicator travelling between models tells
          you which way you moved. */}
      <div
        className="insight-enter"
        style={{ "--enter-delay": "40ms" } as React.CSSProperties}
      >
        <SegmentedTabs
          items={MODEL_TABS}
          value={modelType}
          onChange={setModelType}
          ariaLabel="Valuation model"
          className="flex w-full sm:w-auto"
        />
      </div>

      {/* Top search bar before populate */}
      {modelType === "dcf" && !inputs.baseRevenue && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <DCFTickerInput value={ticker} onSelect={handleTickerSelect} />

                {ticker && profile && (
                  <div className="flex w-full min-w-0 flex-1 items-center gap-2.5">
                    <TickerLogo ticker={ticker} className="w-8 h-8 rounded-lg" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-snow-peak truncate">
                        {profile.name}
                      </p>
                      <p className="text-[11px] text-mist truncate">
                        {profile.sector} · {profile.exchange}
                        {quote && (
                          <>
                            {" · "}
                            {formatCurrency(quote.price)}
                            {" · "}
                            {formatCompactNumber(quote.market_cap)} mkt cap
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {canPopulate && (
                  <Button size="sm" onClick={handlePopulate} className="shrink-0">
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                    Auto-Populate
                  </Button>
                )}

                {canLoadSavedTicker && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      if (!savedForTicker) return;
                      applySavedScenario(savedForTicker);
                    }}
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                    Load Saved
                  </Button>
                )}

                {user && (
                  <div className="relative shrink-0 sm:ml-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsSavedMenuOpen((value) => !value)}
                      className="gap-1"
                    >
                      Saved ({savedScenarios.length})
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>

                    {isSavedMenuOpen && (
                      <div className="popover-materialize absolute right-0 top-full z-20 mt-2 w-72 origin-top-right rounded-xl bg-wolf-surface/95 p-1.5 shadow-2xl ring-1 ring-inset ring-wolf-border/60 backdrop-blur-xl">
                        {savedScenariosLoading ? (
                          <p className="px-2 py-2 text-xs text-mist">Loading saved scenarios...</p>
                        ) : savedScenarios.length === 0 ? (
                          <p className="px-2 py-2 text-xs text-mist">No saved scenarios yet.</p>
                        ) : (
                          <div className="scroll-quiet max-h-64 space-y-1 overflow-y-auto">
                            {savedScenarios.map((entry) => (
                              <div
                                key={`${entry.ticker}-${entry.updatedAt}`}
                                className="group flex items-center justify-between rounded-lg px-2 py-1.5 transition-[background-color,transform] duration-150 ease-out hover:bg-sunset-orange/10 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                              >
                                <button
                                  type="button"
                                  onClick={() => applySavedScenario(entry)}
                                  className="min-w-0 flex-1 text-left flex items-center gap-2"
                                >
                                  <TickerLogo
                                    ticker={entry.ticker}
                                    className="w-6 h-6"
                                    imageClassName="rounded-md"
                                    fallbackClassName="rounded-md text-[8px]"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-snow-peak group-hover:text-sunset-orange transition-colors">{entry.ticker}</p>
                                    <p className="text-[11px] text-mist group-hover:text-sunset-orange/80 transition-colors">Updated {new Date(entry.updatedAt).toLocaleDateString("en-US")}</p>
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteSavedScenario(entry.ticker)}
                                  className="ml-2 rounded p-1 text-mist hover:text-sunset-orange hover:bg-sunset-orange/10 transition-colors"
                                  aria-label={`Delete saved scenarios for ${entry.ticker}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {isPreparingPopulate && (
            <DataHuntingLoader
              ticker={ticker}
              compact
              className="ring-1 ring-inset ring-wolf-border/50"
              detailMessage="Loading 20 years of financial history for the DCF model..."
            />
          )}
        </div>
      )}

      {/* ── Reverse DCF ── */}
      {modelType === "reverse" && (
        <div
          className="insight-enter"
          style={{ "--enter-delay": "80ms" } as React.CSSProperties}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Search className="h-4 w-4 text-sunset-orange" />
                Reverse DCF
              </CardTitle>
              <p className="mt-0.5 text-[11px] text-mist/80">
                Instead of asking what it is worth, ask what the price already
                assumes — and whether you believe it.
              </p>
            </CardHeader>
            <CardContent>
              <ReverseDCFPanel
                inputs={settledInputs}
                ticker={ticker}
                companyName={profile?.name}
                sector={profile?.sector}
                revenueCAGR5Y={revenueHistory.cagr5}
                revenueCAGR10Y={revenueHistory.cagr10}
                fcfMargin5Y={revenueHistory.fcfMargin5}
                marginHistory={revenueHistory.marginHistory}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Main content ──
          Three columns, split by what each one is for: the left is everything
          you manipulate, the middle is every result, the right is everything
          the model has to say about itself.

          The two side columns are pinned and scroll inside themselves. The
          middle one is long - valuation, decision, simulation, sensitivity,
          projections - and reading it used to carry the controls and the
          warnings off the top of the page, so acting on a warning meant
          scrolling back up to find the slider it was about. */}
      {modelType === "dcf" && inputs.baseRevenue > 0 && (
        <>
          {/* ── Ticker and actions ──
        Full width, above the columns. It belongs to the whole screen rather
        than to any one column: changing the ticker replaces everything
        below it. */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <DCFTickerInput value={ticker} onSelect={handleTickerSelect} />
                {ticker && profile && (
                  <div className="flex w-full min-w-0 flex-1 items-center gap-2.5">
                    <TickerLogo ticker={ticker} className="w-8 h-8 rounded-lg" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-snow-peak truncate">
                        {profile.name}
                      </p>
                      <p className="text-[11px] text-mist truncate">
                        {profile.sector} · {profile.exchange}
                        {quote && (
                          <>
                            {" · "}
                            {formatCurrency(quote.price)}
                            {" · "}
                            {formatCompactNumber(quote.market_cap)} mkt cap
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* One wrapping row, not a stack. In a flex-col parent
                    the buttons stretch to the full column width, which spent
                    four rows of vertical space on two actions and pushed the
                    assumptions below the fold. */}
                <div className="flex flex-wrap items-center gap-2">
                {canPopulate && (
                  <Button size="sm" onClick={handlePopulate} className="shrink-0">
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                    Auto-Populate
                  </Button>
                )}

                {canLoadSavedTicker && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      if (!savedForTicker) return;
                      applySavedScenario(savedForTicker);
                    }}
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                    Load Saved
                  </Button>
                )}

                {isPopulated && scenarios && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={handleSaveScenarios}
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    Save Scenarios
                  </Button>
                )}

                {isPopulated && scenarios && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={handleExportScenarios}
                    title="Download all three scenarios as JSON"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Export JSON
                  </Button>
                )}

                {isPopulated && user && (
                  <div className="relative shrink-0">


                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsSavedMenuOpen((value) => !value)}
                      className="gap-1"
                    >
                      Saved ({savedScenarios.length})
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>

                    {isSavedMenuOpen && (
                      <div className="popover-materialize absolute right-0 top-full z-20 mt-2 w-72 origin-top-right rounded-xl bg-wolf-surface/95 p-1.5 shadow-2xl ring-1 ring-inset ring-wolf-border/60 backdrop-blur-xl">
                        {savedScenariosLoading ? (
                          <p className="px-2 py-2 text-xs text-mist">Loading saved scenarios...</p>
                        ) : savedScenarios.length === 0 ? (
                          <p className="px-2 py-2 text-xs text-mist">No saved scenarios yet.</p>
                        ) : (
                          <div className="scroll-quiet max-h-64 space-y-1 overflow-y-auto">
                            {savedScenarios.map((entry) => (
                              <div
                                key={`${entry.ticker}-${entry.updatedAt}`}
                                className="group flex items-center justify-between rounded-lg px-2 py-1.5 transition-[background-color,transform] duration-150 ease-out hover:bg-sunset-orange/10 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                              >
                                <button
                                  type="button"
                                  onClick={() => applySavedScenario(entry)}
                                  className="min-w-0 flex-1 text-left flex items-center gap-2"
                                >
                                  <TickerLogo
                                    ticker={entry.ticker}
                                    className="w-6 h-6"
                                    imageClassName="rounded-md"
                                    fallbackClassName="rounded-md text-[8px]"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-snow-peak group-hover:text-sunset-orange transition-colors">{entry.ticker}</p>
                                    <p className="text-[11px] text-mist group-hover:text-sunset-orange/80 transition-colors">Updated {new Date(entry.updatedAt).toLocaleDateString("en-US")}</p>
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteSavedScenario(entry.ticker)}
                                  className="ml-2 rounded p-1 text-mist hover:text-sunset-orange hover:bg-sunset-orange/10 transition-colors"
                                  aria-label={`Delete saved scenarios for ${entry.ticker}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                </div>
              </div>

              {saveStatus !== "idle" && isPopulated && user && (
                <p className={saveStatus === "saved" ? "mt-2 text-[11px] text-bullish" : "mt-2 text-[11px] text-bearish"}>
                  {saveStatus === "saved" ? "Scenarios saved to your account." : "Could not save scenarios. Please try again."}
                </p>
              )}
            </CardContent>
          </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Column 1 — what you set */}
          <div ref={assumptionsColumnRef} className="lg:sticky lg:top-18 lg:col-span-3">
            <Card
                className="fit-to-viewport lg:flex lg:flex-col"
                style={
                  assumptionsMaxHeight
                    ? ({ "--fit-height": `${assumptionsMaxHeight}px` } as React.CSSProperties)
                    : undefined
                }
              >
              <CardHeader className="shrink-0 pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  Model Assumptions
                  {isPopulated && (
                    <Badge variant="golden" className="text-[9px]">
                      Auto-filled
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="scroll-quiet space-y-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-3">
                <DCFAssumptions
                  inputs={inputs}
                  bands={anchorContext.bands}
                  waccEstimate={waccEstimate}
                  scenarios={scenarios}
                  activeScenario={activeScenario}
                  onScenarioChange={handleScenarioChange}
                  onChange={setInputs}
                />
              </CardContent>
            </Card>
          </div>

          {/* Column 2 — every result, in reading order */}
          <div
            className={cn(
              "space-y-6",
              showDiagnostics ? "lg:col-span-5" : "lg:col-span-9"
            )}
          >
            {result && (
              <>
                <Card className="insight-enter" style={{ "--enter-delay": "0ms" } as React.CSSProperties}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-sm">Valuation Output</CardTitle>
                      {/* Sits here rather than on the panel it controls: a
                          button that hides its own container has nowhere to
                          live once it has been used. */}
                      {isPopulated ? (
                        <button
                          type="button"
                          onClick={() => setShowDiagnostics((value) => !value)}
                          aria-pressed={showDiagnostics}
                          className={cn(
                            // Shown at every width. Desktop-only would have
                            // let a reader hide the column, narrow the window,
                            // and lose the only control that brings it back.
                            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1",
                            "text-[11px] font-medium text-mist ring-1 ring-inset ring-wolf-border/45",
                            "transition-[background-color,color,transform] duration-150 ease-out",
                            "hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-[0.97]",
                            "motion-reduce:transition-none motion-reduce:active:scale-100"
                          )}
                        >
                          {showDiagnostics ? (
                            <PanelRightClose className="h-3.5 w-3.5" />
                          ) : (
                            <PanelRightOpen className="h-3.5 w-3.5" />
                          )}
                          {showDiagnostics ? "Hide diagnostics" : "Diagnostics"}
                          {!showDiagnostics && diagnosticsCount > 0 ? (
                            <span className="rounded bg-golden-hour/15 px-1 font-mono text-[10px] tabular-nums text-golden-hour">
                              {diagnosticsCount}
                            </span>
                          ) : null}
                        </button>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {valueCovered ? (
                      <ValuationCover
                        gate={gate}
                        onUncover={() => {
                          setValueUncovered(true);
                          track("valuation_uncovered", { ticker, props: { reasons: gate.reasons } });
                        }}
                      />
                    ) : (
                      <DCFResults
                        result={result}
                        ticker={ticker || "STOCK"}
                        wacc={inputs.wacc}
                        terminalGrowthRate={inputs.terminalGrowthRate}
                        fields={sourcedFields}
                        guard={valuationGuard}
                      />
                    )}
                  </CardContent>
                </Card>
                <Card className="insight-enter" style={{ "--enter-delay": "50ms" } as React.CSSProperties}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Position Decision</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PositionDecisionEngine
                                            result={steadyResult ?? result}
                                            simulation={simulation}
                                            weights={convictionWeights}
                                            onWeightsChange={setConvictionWeights}
                                            guard={valuationGuard}
                                          />
                  </CardContent>
                </Card>

                <Card className="insight-enter" style={{ "--enter-delay": "100ms" } as React.CSSProperties}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Monte Carlo Simulation</CardTitle>
                      <Badge variant="outline" className="text-[9px] font-mono">
                        2,000 runs
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <DCFMonteCarlo
                      monteCarlo={simulation?.monteCarlo ?? null}
                      currentPrice={settledInputs.currentPrice}
                      weights={scenarioWeights}
                      onWeightsChange={setScenarioWeights}
                      correlation={growthMarginCorrelation}
                      onCorrelationChange={setGrowthMarginCorrelation}
                    />
                  </CardContent>
                </Card>

                <Card className="insight-enter" style={{ "--enter-delay": "150ms" } as React.CSSProperties}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Sensitivity Analysis</CardTitle>
                      {/* The existing grid is two financial assumptions, so it
                          says nothing about the business. The operating pair is
                          where the disagreement usually lives. */}
                      <SegmentedTabs
                        size="sm"
                        ariaLabel="Sensitivity axes"
                        value={sensitivityAxes}
                        onChange={setSensitivityAxes}
                        items={[
                          { key: "financial" as const, label: "WACC × TGR" },
                          { key: "operating" as const, label: "Growth × Margin" },
                        ]}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <DCFSensitivity inputs={settledInputs} axes={sensitivityAxes} />
                  </CardContent>
                </Card>

                <Card className="insight-enter" style={{ "--enter-delay": "185ms" } as React.CSSProperties}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">What Moves the Answer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DCFTornado inputs={settledInputs} />
                  </CardContent>
                </Card>

                <Card className="insight-enter" style={{ "--enter-delay": "200ms" } as React.CSSProperties}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Cash Flow Projections</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DCFProjectionTable result={steadyResult ?? result} />
                  </CardContent>
                </Card>

                <Card className="insight-enter" style={{ "--enter-delay": "240ms" } as React.CSSProperties}>
                  <CardContent className="pt-5">
                    <DCFFCFChart
                      result={steadyResult ?? result}
                      baseRevenue={settledInputs.baseRevenue}
                      baseFCF={baseFCF}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Column 3 — what is wrong with it */}
          <div
            ref={diagnosticsColumnRef}
            hidden={!showDiagnostics}
            className="lg:sticky lg:top-18 lg:col-span-4"
          >
            {isPopulated && showDiagnostics && (
              <Card
                className="insight-enter fit-to-viewport lg:flex lg:flex-col"
                style={
                  {
                    "--enter-delay": "30ms",
                    ...(diagnosticsMaxHeight
                      ? { "--fit-height": `${diagnosticsMaxHeight}px` }
                      : {}),
                  } as React.CSSProperties
                }
              >
                <CardHeader className="shrink-0 pb-3">
                  <CardTitle className="text-sm">Diagnostics</CardTitle>
                </CardHeader>
                <CardContent className="scroll-quiet lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-3">
                  <DCFDiagnostics
                    anchorWarnings={anchorContext.warnings}
                    coherenceWarnings={coherenceWarnings}
                    fields={sourcedFields}
                    notices={sbcNotice ? [sbcNotice] : []}
                    onShareCountBasisChange={setShareCountBasis}
                    revenueBase={
                      isPopulated ? (
                        <RevenueBasePicker
                          bases={bases}
                          basis={revenueBasis}
                          value={inputs.baseRevenue}
                          divergence={revenueDivergence}
                          onChange={handleRevenueBasisChange}
                          onManualChange={(value) => setRevenueBase("manual", value)}
                          perimeterConfirmed={perimeterConfirmed}
                          onConfirmPerimeter={() => setPerimeterConfirmed(true)}
                        />
                      ) : null
                    }
                    provenance={
                      isPopulated ? (
                        <DCFProvenance provenance={provenance} gate={gate} basis={cashFlowBasis} addBack={addBack} onBasisChange={handleCashFlowBasisChange} />
                      ) : null
                    }
                    regime={isPopulated ? <DCFRegime regimes={regimes} paydown={paydown} /> : null}
                    scenarioTable={
                      scenarios ? (
                        <DCFScenarioTable
                          scenarios={scenarios}
                          activeScenario={activeScenario}
                          onScenarioChange={handleScenarioChange}
                          liveInputs={inputs}
                        />
                      ) : null
                    }
                    /* These are the figures the model reads rather than the
                       ones you choose, so they belong with the findings and
                       not with the controls: a wrong share count invalidates
                       every slider in the column to the left. */
                    balanceSheet={
                      <DCFDataSources
                        fields={sourcedFields}
                        includeLeases={includeLeases}
                        onIncludeLeasesChange={handleIncludeLeasesChange}
                        leaseTreatment={leaseTreatment}
                        deductSBC={deductSBC}
                        onDeductSBCChange={handleDeductSBCChange}
                        baseRevenue={inputs.baseRevenue}
                        overrides={balanceOverrides}
                        onOverride={handleBalanceOverride}
                        freeCashFlow={
                          // Undo the deduction before handing it over, so the
                          // panel can show both figures. Deriving both lines
                          // from the live margin printed the same number twice
                          // and made the adjustment look inert.
                          inputs.baseRevenue * inputs.baseFCFMargin +
                          (deductSBC
                            ? (sourcedFields?.shareBasedCompensation.value ?? 0)
                            : 0)
                        }
                        isLoading={secFetching}
                      />
                    }
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        </>
      )}

      {modelType === "eps" && (
        <EPSMultipleModel
          ticker={ticker || "STOCK"}
          queryTicker={ticker}
          companyName={profile?.name}
          companyMeta={
            profile
              ? `${profile.sector} · ${profile.exchange}${
                  quote
                    ? ` · ${formatCurrency(quote.price)} · ${formatCompactNumber(quote.market_cap)} mkt cap`
                    : ""
                }`
              : undefined
          }
          isPreparingData={isPreparingPopulate}
          canAutoFill={canPopulateEPS}
          onTickerSelect={handleTickerSelect}
          onAutoFill={handlePopulateEPS}
          currentPrice={quote?.price ?? 0}
          inputs={epsInputs}
          onChange={setEpsInputs}
        />
      )}

      {modelType === "capital" && (
        <CapitalAllocatorModel
          ticker={ticker || "STOCK"}
          queryTicker={ticker}
          companyName={profile?.name}
          companyMeta={
            profile
              ? `${profile.sector} · ${profile.exchange}${
                  quote
                    ? ` · ${formatCurrency(quote.price)} · ${formatCompactNumber(quote.market_cap)} mkt cap`
                    : ""
                }`
              : undefined
          }
          isPreparingData={isPreparingPopulate}
          canAutoFill={!!quote && !!companyFinancials}
          onTickerSelect={handleTickerSelect}
          onAutoFill={handlePopulate}
          currentPrice={quote?.price ?? 0}
          baseRevenue={inputs.baseRevenue}
          sharesOutstanding={inputs.sharesOutstanding}
          totalDebt={inputs.totalDebt}
          cashAndEquivalents={inputs.cashAndEquivalents}
          revenueGrowthRate={capitalRevenueGrowth}
          onRevenueGrowthRateChange={setCapitalRevenueGrowth}
          terminalGrowthRate={inputs.terminalGrowthRate}
          projectionYears={capitalProjectionYears}
          onProjectionYearsChange={setCapitalProjectionYears}
          ocfMargin={ocfMargin}
          onOcfMarginChange={setOcfMargin}
          capexMargin={capexMargin}
          onCapexMarginChange={setCapexMargin}
          wacc={capitalWacc}
          onWaccChange={setCapitalWacc}
        />
      )}

      {/* Empty state — no ticker.
          A 200px-tall card holding one grey glyph is a lot of page for "nothing
          here yet". The icon sits on a raised tile so it reads as a placeholder
          for content rather than a disabled control, and the two lines carry
          the weight instead of the whitespace. */}
      {modelType === "dcf" && inputs.baseRevenue <= 0 && !ticker && (
        <Card
          className="insight-enter"
          style={{ "--enter-delay": "80ms" } as React.CSSProperties}
        >
          <CardContent className="flex flex-col items-center py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-snow-peak/[0.04] ring-1 ring-inset ring-wolf-border/40">
              <Calculator className="h-5 w-5 text-mist/70" />
            </div>
            <p className="mt-4 text-sm font-medium text-snow-peak">
              Search for a ticker to begin your DCF analysis
            </p>
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-mist/70">
              Financial data auto-populates from the company&apos;s latest annual
              filings.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ticker selected but not populated */}
      {modelType === "dcf" && ticker && inputs.baseRevenue <= 0 && (
        <Card
          className="insight-enter"
          style={{ "--enter-delay": "80ms" } as React.CSSProperties}
        >
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sunset-orange/10 ring-1 ring-inset ring-sunset-orange/20">
              <Zap className="h-5 w-5 text-sunset-orange" />
            </div>
            <p className="mt-4 text-sm text-mist">
              Click{" "}
              <span className="font-medium text-sunset-orange">
                Auto-Populate
              </span>{" "}
              to load {ticker}&apos;s financials into the model
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
