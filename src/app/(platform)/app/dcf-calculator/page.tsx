"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Calculator, ChevronDown, FolderOpen, RotateCcw, Save, Trash2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { DataHuntingLoader } from "@/components/stock/data-hunting-loader";
import { DCFTickerInput } from "@/components/dcf/dcf-ticker-input";
import {
  EPSMultipleModel,
  type EPSMultipleInputs,
} from "@/components/dcf/eps-multiple-model";
import { DCFAssumptions } from "@/components/dcf/dcf-assumptions";
import { DCFResults } from "@/components/dcf/dcf-results";
import { DCFProjectionTable } from "@/components/dcf/dcf-projection-table";
import { DCFSensitivity } from "@/components/dcf/dcf-sensitivity";
import { DCFMonteCarlo } from "@/components/dcf/dcf-monte-carlo";
import { DCFFCFChart } from "@/components/dcf/dcf-fcf-chart";
import {
  useStockQuote,
  useStockProfile,
  useFinancials,
} from "@/hooks/use-stock-data";
import { useSupabase } from "@/providers/supabase-provider";
import { useDCFScenarios } from "@/hooks/use-dcf-scenarios";
import {
  runDCF,
  generateDCFScenarios,
  calculateCAGR,
} from "@/lib/calculations";
import type {
  DCFInputs,
  DCFResult,
  DCFScenarioKey,
  DCFScenarioSet,
  WACCEstimate,
} from "@/lib/calculations";
import { formatCurrency, formatCompactNumber } from "@/lib/utils";

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
  const [modelType, setModelType] = useState<"dcf" | "eps">("dcf");
  const [ticker, setTicker] = useState("");
  const [inputs, setInputs] = useState<DCFInputs>(DEFAULT_INPUTS);
  const [epsInputs, setEpsInputs] = useState<EPSMultipleInputs>(DEFAULT_EPS_INPUTS);
  const [waccEstimate, setWaccEstimate] = useState<WACCEstimate | null>(null);
  const [scenarios, setScenarios] = useState<DCFScenarioSet | null>(null);
  const [activeScenario, setActiveScenario] = useState<DCFScenarioKey>("base");
  const [isPopulated, setIsPopulated] = useState(false);
  const [isSavedMenuOpen, setIsSavedMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const animationRef = useRef<number | null>(null);
  const { user } = useSupabase();
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

  const animateInputsTo = useCallback((target: DCFInputs, duration = 380) => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

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
  const handlePopulate = useCallback(() => {
    if (!quote || !financials) return;

    const generated = generateDCFScenarios({
      quote,
      financials,
      sector: profile?.sector,
    });

    if (!generated) return;

    setScenarios(generated);
    setActiveScenario("base");
    setWaccEstimate(generated.waccEstimate);
    animateInputsTo(generated.base.inputs, 420);
    setIsPopulated(true);
  }, [quote, financials, profile, animateInputsTo]);

  const handleScenarioChange = useCallback((scenario: DCFScenarioKey) => {
    if (!scenarios) return;
    setActiveScenario(scenario);
    animateInputsTo(scenarios[scenario].inputs, 420);
  }, [scenarios, animateInputsTo]);

  useEffect(() => {
    if (!scenarios || !isPopulated) return;

    const current = scenarios[activeScenario];
    if (!current) return;

    const same = JSON.stringify(current.inputs) === JSON.stringify(inputs);
    if (same) return;

    setScenarios((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [activeScenario]: {
          ...prev[activeScenario],
          inputs: { ...inputs },
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
    setScenarios(null);
    setWaccEstimate(null);
    setActiveScenario("base");
    setIsPopulated(false);
    setIsSavedMenuOpen(false);
    setSaveStatus("idle");
    setEpsInputs(DEFAULT_EPS_INPUTS);
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
    setScenarios(payload.scenarios);
    setActiveScenario(payload.activeScenario);
    setWaccEstimate(payload.waccEstimate);
    animateInputsTo(selected.inputs, 420);
    setIsPopulated(true);
    setIsSavedMenuOpen(false);
    setSaveStatus("idle");
  }, [animateInputsTo]);

  const handleSaveScenarios = useCallback(async () => {
    if (!user || !ticker || !scenarios) return;

    const scenariosToSave: DCFScenarioSet = {
      ...scenarios,
      [activeScenario]: {
        ...scenarios[activeScenario],
        inputs: { ...inputs },
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
  }, [activeScenario, inputs, saveScenario, scenarios, ticker, user, waccEstimate]);

  const handleDeleteSavedScenario = useCallback(async (savedTicker: string) => {
    await deleteScenario(savedTicker);
  }, [deleteScenario]);

  const handlePopulateEPS = useCallback(() => {
    if (!quote || !financials) return;

    const annualIncome = financials.income_statement.annual
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
  }, [quote, financials]);

  const result: DCFResult | null = useMemo(() => {
    if (inputs.baseRevenue <= 0 || inputs.sharesOutstanding <= 0) return null;
    return runDCF(inputs);
  }, [inputs]);

  const handleReset = useCallback(() => {
    setTicker("");
    setInputs(DEFAULT_INPUTS);
    setEpsInputs(DEFAULT_EPS_INPUTS);
    setWaccEstimate(null);
    setScenarios(null);
    setActiveScenario("base");
    setIsPopulated(false);
  }, []);

  const canPopulate = !!quote && !!financials && !isPopulated;
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
  const canPopulateEPS = !!quote && !!financials;
  const normalizedTicker = ticker.toUpperCase();
  const savedForTicker = savedScenarios.find((entry) => entry.ticker === normalizedTicker);
  const canLoadSavedTicker = !!savedForTicker;

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
            <Calculator className="w-5 h-5 text-sunset-orange" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-snow-peak">
              DCF Calculator
            </h1>
            <p className="text-xs text-mist mt-0.5">
              Two-stage discounted cash flow intrinsic value model
            </p>
          </div>
        </div>
        {isPopulated && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset
          </Button>
        )}
      </div>

      {/* Model Toggle */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-wolf-border/40 bg-wolf-black/40 p-1">
            <button
              type="button"
              onClick={() => setModelType("dcf")}
              className={`h-9 rounded-md text-sm font-medium transition-all cursor-pointer border ${
                modelType === "dcf"
                  ? "bg-sunset-orange/15 text-sunset-orange border-sunset-orange/30"
                  : "text-mist border-transparent hover:text-snow-peak hover:bg-wolf-surface/70"
              }`}
            >
              DCF Model (Advanced)
            </button>
            <button
              type="button"
              onClick={() => setModelType("eps")}
              className={`h-9 rounded-md text-sm font-medium transition-all cursor-pointer border ${
                modelType === "eps"
                  ? "bg-sunset-orange/15 text-sunset-orange border-sunset-orange/30"
                  : "text-mist border-transparent hover:text-snow-peak hover:bg-wolf-surface/70"
              }`}
            >
              EPS Multiple Model (Simple)
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Top search bar before populate */}
      {modelType === "dcf" && !inputs.baseRevenue && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <DCFTickerInput value={ticker} onSelect={handleTickerSelect} />

                {ticker && profile && (
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
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
              </div>
            </CardContent>
          </Card>

          {isPreparingPopulate && (
            <DataHuntingLoader
              ticker={ticker}
              compact
              className="border border-wolf-border/50"
            />
          )}
        </div>
      )}

      {/* Main Content: stable assumptions column + right analysis stack */}
      {modelType === "dcf" && inputs.baseRevenue > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Assumptions Panel (sticky and full viewport height) */}
          <div className="lg:col-span-4 lg:self-start lg:sticky lg:top-4">
            <Card className="lg:max-h-[calc(55vh-2rem)] lg:flex lg:flex-col lg:mt-12">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  Model Assumptions
                  {isPopulated && (
                    <Badge variant="golden" className="text-[9px]">
                      Auto-filled
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-3">
                <DCFAssumptions
                  inputs={inputs}
                  waccEstimate={waccEstimate}
                  scenarios={scenarios}
                  activeScenario={activeScenario}
                  onScenarioChange={handleScenarioChange}
                  onChange={setInputs}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right column order:
              1) Valuation Output
              2) Monte Carlo
              3) Sensitivity
              4) Cash Flow Projections
              5) Projected Free Cash Flow */}
          <div className="lg:col-span-8 space-y-6">
            {/* Ticker Selection moved above Valuation Output */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <DCFTickerInput value={ticker} onSelect={handleTickerSelect} />

                  {ticker && profile && (
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
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

                  {isPopulated && user && scenarios && (
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
                        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-wolf-border/50 bg-midnight-rock/95 backdrop-blur p-1.5 shadow-xl">
                          {savedScenariosLoading ? (
                            <p className="px-2 py-2 text-xs text-mist">Loading saved scenarios...</p>
                          ) : savedScenarios.length === 0 ? (
                            <p className="px-2 py-2 text-xs text-mist">No saved scenarios yet.</p>
                          ) : (
                            <div className="max-h-64 overflow-y-auto space-y-1">
                              {savedScenarios.map((entry) => (
                                <div
                                  key={`${entry.ticker}-${entry.updatedAt}`}
                                  className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-sunset-orange/10 transition-colors"
                                >
                                  <button
                                    type="button"
                                    onClick={() => applySavedScenario(entry)}
                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <p className="text-xs font-semibold text-snow-peak group-hover:text-sunset-orange transition-colors">{entry.ticker}</p>
                                    <p className="text-[11px] text-mist group-hover:text-sunset-orange/80 transition-colors">Updated {new Date(entry.updatedAt).toLocaleDateString("en-US")}</p>
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

                {saveStatus !== "idle" && isPopulated && user && (
                  <p className={saveStatus === "saved" ? "mt-2 text-[11px] text-emerald-400" : "mt-2 text-[11px] text-rose-400"}>
                    {saveStatus === "saved" ? "Scenarios saved to your account." : "Could not save scenarios. Please try again."}
                  </p>
                )}
              </CardContent>
            </Card>

            {result && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Valuation Output</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DCFResults result={result} ticker={ticker || "STOCK"} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Monte Carlo Simulation</CardTitle>
                      <Badge variant="outline" className="text-[9px] font-mono">
                        2,000 runs
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <DCFMonteCarlo inputs={inputs} iterations={2000} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Sensitivity Analysis</CardTitle>
                      <Badge variant="outline" className="text-[9px] font-mono">
                        WACC × TGR
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <DCFSensitivity inputs={inputs} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Cash Flow Projections</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DCFProjectionTable result={result} />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-5">
                    <DCFFCFChart
                      result={result}
                      baseRevenue={inputs.baseRevenue}
                      baseFCF={baseFCF}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
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

      {/* Empty state — no ticker */}
      {modelType === "dcf" && inputs.baseRevenue <= 0 && !ticker && (
        <Card>
          <CardContent className="py-16 text-center">
            <Calculator className="w-10 h-10 text-mist/30 mx-auto mb-3" />
            <p className="text-sm text-mist">
              Search for a ticker above to begin your DCF analysis
            </p>
            <p className="text-xs text-mist/60 mt-1">
              Financial data will auto-populate from the company&apos;s latest
              annual filings
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ticker selected but not populated */}
      {modelType === "dcf" && ticker && inputs.baseRevenue <= 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="w-8 h-8 text-sunset-orange/40 mx-auto mb-3" />
            <p className="text-sm text-mist">
              Click{" "}
              <span className="text-sunset-orange font-medium">
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
