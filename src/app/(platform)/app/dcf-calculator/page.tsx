"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Calculator, RotateCcw, Zap } from "lucide-react";
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
  const animationRef = useRef<number | null>(null);

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
    setEpsInputs(DEFAULT_EPS_INPUTS);
  }, []);

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
                </div>
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
