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
import {
  EPSMultipleModel,
  type EPSMultipleInputs,
} from "@/components/dcf/eps-multiple-model";
import { CapitalAllocatorModel } from "@/components/dcf/capital-allocator-model";
import { DCFAssumptions } from "@/components/dcf/dcf-assumptions";
import { DCFResults } from "@/components/dcf/dcf-results";
import { DCFProjectionTable } from "@/components/dcf/dcf-projection-table";
import { DCFSensitivity } from "@/components/dcf/dcf-sensitivity";
import { DCFMonteCarlo } from "@/components/dcf/dcf-monte-carlo";
import { DCFFCFChart } from "@/components/dcf/dcf-fcf-chart";
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
import { buildMarginHistory } from "@/lib/calculations/margin-history";

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
  const isAnimatingRef = useRef(false);

  const animateInputsTo = useCallback((target: DCFInputs, duration = 380) => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    isAnimatingRef.current = true;

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
        isAnimatingRef.current = false;
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
      shareCountBasis,
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
  const appliedFactsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isPopulated || !sourcedFields) return;

    const signature = JSON.stringify([
      ticker,
      sourcedFields.netDebt.financialDebt,
      sourcedFields.netDebt.operatingLeases,
      sourcedFields.netDebt.cash,
      sourcedFields.netDebt.includesLeases,
      sourcedFields.sharesOutstanding.value,
    ]);
    if (appliedFactsRef.current === signature) return;
    appliedFactsRef.current = signature;

    applyAccountingTreatment((previous) =>
      applySourcedBalanceSheet(previous, sourcedFields)
    );
  }, [isPopulated, sourcedFields, ticker, applyAccountingTreatment]);

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

      applyAccountingTreatment((previous) => {
        if (previous.baseRevenue <= 0) return previous;
        const sbcMargin = sbc / previous.baseRevenue;
        // Deducting subtracts it once; restoring adds the same amount back, so
        // flipping the toggle twice returns to exactly where it started.
        const shift = next ? -sbcMargin : sbcMargin;
        return { ...previous, baseFCFMargin: previous.baseFCFMargin + shift };
      });
    },
    [sourcedFields, applyAccountingTreatment]
  );

  // What the company has actually managed, which is what makes the implied
  // assumption meaningful rather than merely precise.
  const revenueHistory = useMemo(() => {
    const annual = companyFinancials?.income_statement.annual ?? [];
    if (annual.length < 2) {
      return { cagr5: null, cagr10: null, fcfMargin5: null, marginHistory: null };
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
    const marginHistory = buildMarginHistory({
      revenues: sortedIncomeRows,
      cashFlows,
      sector: profile?.sector,
      years: 5,
    });

    return {
      cagr5: calculateCAGR(revenues, 5),
      cagr10: calculateCAGR(revenues, 10),
      fcfMargin5: marginHistory.median,
      marginHistory,
    };
  }, [companyFinancials, profile?.sector]);

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

    setScenarios(sourced);
    setActiveScenario("base");
    setWaccEstimate(sourced.waccEstimate);
    animateInputsTo(sourced.base.inputs, 420);
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
  }, [quote, companyFinancials, profile, animateInputsTo, sourcedFields]);

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

  useEffect(() => {
    if (!scenarios || !isPopulated) return;
    // Never during a switch: what is on screen belongs to the scenario being
    // left, not the one being entered.
    if (isAnimatingRef.current) return;

    const current = scenarios[activeScenario];
    if (!current) return;

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
      JSON.stringify(forComparison(current.inputs)) ===
      JSON.stringify(forComparison(inputs));
    if (same) return;

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
  }, [activeScenario, inputs, isPopulated, scenarios]);

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
    appliedFactsRef.current = null;
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
    appliedFactsRef.current = null;
    setScenarios(payload.scenarios);
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
  }, [animateInputsTo, quote?.price]);

  useEffect(() => {
    // Keep DCF comparison anchored to live market price instead of stored snapshots.
    if (!ticker || quote?.price == null || quote.price <= 0) return;

    setInputs((prev) =>
      prev.currentPrice === quote.price
        ? prev
        : {
            ...prev,
            currentPrice: quote.price,
          }
    );
  }, [quote?.price, ticker]);

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

    setScenarios(scenariosToSave);
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

  const result: DCFResult | null = useMemo(() => {
    if (inputs.baseRevenue <= 0 || inputs.sharesOutstanding <= 0) return null;
    return runDCF(inputs);
  }, [inputs]);

  // Switching scenario tweens every input over 420ms, which means a new inputs
  // object roughly 25 times in half a second. Everything downstream was
  // recomputing at that rate - a 2,000-path Monte Carlo, the sensitivity grid,
  // two Recharts trees - and no amount of easing looks smooth when the frame
  // budget is spent 25 times over. So the tween now only drives what has to
  // follow it live: the sliders and the headline figure. The heavy surfaces
  // read a settled copy that lands once the values stop moving, which also
  // covers dragging a slider by hand, not just the scenario switch.
  const settledInputs = useSettledValue(inputs, 130);
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
      }),
    [anchorContext.warnings, coherenceWarnings, sourcedFields]
  );

  const handleExportScenarios = useCallback(() => {
    if (!ticker || !scenarios) return;

    const payload = buildScenarioExport({
      ticker,
      companyName: profile?.name ?? null,
      currentPrice: inputs.currentPrice,
      scenarios,
      activeScenario,
      liveInputs: inputs,
      sourcedFields,
      monteCarlo: simulation?.monteCarlo ?? null,
      conviction: simulation?.conviction ?? null,
      stress: simulation?.stress ?? null,
      zones: simulation?.zones ?? null,
      scoreReference: simulation?.reference ?? null,
      warnings: [
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
  ]);

  const handleReset = useCallback(() => {
    setTicker("");
    setInputs(DEFAULT_INPUTS);
    setIncludeLeases(false);
    setDeductSBC(false);
    setBalanceOverrides({});
    setShareCountBasis(undefined);
    appliedFactsRef.current = null;
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
                    <DCFResults
                      result={result}
                      ticker={ticker || "STOCK"}
                      wacc={inputs.wacc}
                      terminalGrowthRate={inputs.terminalGrowthRate}
                      fields={sourcedFields}
                      guard={valuationGuard}
                    />
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
                    onShareCountBasisChange={setShareCountBasis}
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
