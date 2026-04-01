"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataHuntingLoader } from "@/components/stock/data-hunting-loader";
import { DCFTickerInput } from "@/components/dcf/dcf-ticker-input";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { cn, formatCompactNumber, formatCurrency, formatPercent } from "@/lib/utils";
import { Info, SlidersHorizontal, Target, Zap } from "lucide-react";

interface CapitalAllocatorModelProps {
  ticker: string;
  queryTicker: string;
  companyName?: string;
  companyMeta?: string;
  isPreparingData?: boolean;
  canAutoFill: boolean;
  onTickerSelect: (ticker: string) => void;
  onAutoFill: () => void;
  currentPrice: number;
  baseRevenue: number;
  sharesOutstanding: number;
  totalDebt: number;
  cashAndEquivalents: number;
  revenueGrowthRate: number;
  onRevenueGrowthRateChange: (value: number) => void;
  terminalGrowthRate: number;
  projectionYears: 5 | 10;
  onProjectionYearsChange: (years: 5 | 10) => void;
  ocfMargin: number;
  onOcfMarginChange: (value: number) => void;
  capexMargin: number;
  onCapexMarginChange: (value: number) => void;
  wacc: number;
  onWaccChange: (value: number) => void;
}

interface CapitalProjectionPoint {
  year: number;
  label: string;
  revenue: number;
  ocf: number;
  capex: number;
  fcf: number;
  pvFcf: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatShortCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function getHeatmapColor(cellValue: number, currentPrice: number): string {
  if (currentPrice <= 0 || cellValue <= 0) return "bg-wolf-black/50 text-gray-100";

  const delta = (cellValue - currentPrice) / currentPrice;

  if (delta > 0) {
    if (delta > 0.3) return "bg-emerald-600 text-gray-100";
    if (delta >= 0.1) return "bg-emerald-700 text-gray-100";
    return "bg-emerald-900 text-gray-100";
  }

  const downside = Math.abs(delta);
  if (downside > 0.2) return "bg-rose-700 text-gray-100";
  return "bg-rose-900 text-gray-100";
}

function getRoundedYAxisDomain(values: number[]): [number, number] {
  const maxPos = Math.max(0, ...values);
  const minNeg = Math.min(0, ...values);
  const absMax = Math.max(maxPos, Math.abs(minNeg));

  if (absMax === 0) return [-1, 1];

  const billion = 1_000_000_000;
  const step =
    absMax >= 200 * billion
      ? 10 * billion
      : absMax >= 100 * billion
        ? 5 * billion
        : absMax >= 25 * billion
          ? 2 * billion
          : 1 * billion;

  const roundedMax = maxPos > 0 ? Math.ceil(maxPos / step) * step + step : step;
  const roundedMin = minNeg < 0 ? Math.floor(minNeg / step) * step - step : 0;

  return [roundedMin, roundedMax];
}

export function CapitalAllocatorModel({
  ticker,
  queryTicker,
  companyName,
  companyMeta,
  isPreparingData = false,
  canAutoFill,
  onTickerSelect,
  onAutoFill,
  currentPrice,
  baseRevenue,
  sharesOutstanding,
  totalDebt,
  cashAndEquivalents,
  revenueGrowthRate,
  onRevenueGrowthRateChange,
  terminalGrowthRate,
  projectionYears,
  onProjectionYearsChange,
  ocfMargin,
  onOcfMarginChange,
  capexMargin,
  onCapexMarginChange,
  wacc,
  onWaccChange,
}: CapitalAllocatorModelProps) {
  const projections = useMemo<CapitalProjectionPoint[]>(() => {
    if (baseRevenue <= 0) return [];

    const rows: CapitalProjectionPoint[] = [];
    let revenue = baseRevenue;

    for (let year = 1; year <= projectionYears; year += 1) {
      revenue = revenue * (1 + revenueGrowthRate);
      const ocf = revenue * ocfMargin;
      const capexAbs = revenue * capexMargin;
      const fcf = ocf - capexAbs;
      const discountFactor = 1 / Math.pow(1 + wacc, year);

      rows.push({
        year,
        label: `Y${year}`,
        revenue,
        ocf,
        capex: -capexAbs,
        fcf,
        pvFcf: fcf * discountFactor,
      });
    }

    return rows;
  }, [baseRevenue, capexMargin, ocfMargin, projectionYears, revenueGrowthRate, wacc]);

  const valuation = useMemo(() => {
    if (!projections.length || sharesOutstanding <= 0) {
      return {
        intrinsicValuePerShare: 0,
        enterpriseValue: 0,
        equityValue: 0,
        terminalValue: 0,
      };
    }

    const lastFCF = projections[projections.length - 1]?.fcf ?? 0;
    const safeTerminalGrowth = Math.min(terminalGrowthRate, wacc - 0.005);
    const terminalValue =
      wacc > safeTerminalGrowth ? (lastFCF * (1 + safeTerminalGrowth)) / (wacc - safeTerminalGrowth) : 0;
    const pvTerminal = terminalValue / Math.pow(1 + wacc, projectionYears);

    const sumPVFCF = projections.reduce((sum, row) => sum + row.pvFcf, 0);
    const enterpriseValue = sumPVFCF + pvTerminal;
    const netDebt = totalDebt - cashAndEquivalents;
    const equityValue = enterpriseValue - netDebt;
    const intrinsicValuePerShare = Math.max(0, equityValue / sharesOutstanding);

    return {
      intrinsicValuePerShare,
      enterpriseValue,
      equityValue,
      terminalValue,
    };
  }, [cashAndEquivalents, projectionYears, projections, sharesOutstanding, terminalGrowthRate, totalDebt, wacc]);

  const upside = currentPrice > 0 ? (valuation.intrinsicValuePerShare - currentPrice) / currentPrice : 0;

  const waccScenarios = useMemo(() => {
    const deltas = [-0.02, -0.01, 0, 0.01, 0.02];
    return deltas.map((delta) => clamp(wacc + delta, 0.04, 0.25));
  }, [wacc]);

  const capexScenarios = useMemo(() => {
    const deltas = [-0.02, -0.01, 0, 0.01, 0.02];
    return deltas.map((delta) => clamp(capexMargin + delta, 0.01, 0.35));
  }, [capexMargin]);

  const calcIntrinsicForScenario = useMemo(() => {
    return (scenarioWacc: number, scenarioCapexMargin: number): number => {
      if (baseRevenue <= 0 || sharesOutstanding <= 0) return 0;

      let revenue = baseRevenue;
      let sumPVFCF = 0;
      let lastFCF = 0;

      for (let year = 1; year <= projectionYears; year += 1) {
        revenue = revenue * (1 + revenueGrowthRate);
        const ocf = revenue * ocfMargin;
        const capexAbs = revenue * scenarioCapexMargin;
        const fcf = ocf - capexAbs;
        const discountFactor = 1 / Math.pow(1 + scenarioWacc, year);

        sumPVFCF += fcf * discountFactor;
        lastFCF = fcf;
      }

      const safeTerminalGrowth = Math.min(terminalGrowthRate, scenarioWacc - 0.005);
      const terminalValue =
        scenarioWacc > safeTerminalGrowth
          ? (lastFCF * (1 + safeTerminalGrowth)) / (scenarioWacc - safeTerminalGrowth)
          : 0;

      const pvTerminal = terminalValue / Math.pow(1 + scenarioWacc, projectionYears);
      const enterpriseValue = sumPVFCF + pvTerminal;
      const netDebt = totalDebt - cashAndEquivalents;
      const equityValue = enterpriseValue - netDebt;

      return Math.max(0, equityValue / sharesOutstanding);
    };
  }, [baseRevenue, cashAndEquivalents, ocfMargin, projectionYears, revenueGrowthRate, sharesOutstanding, terminalGrowthRate, totalDebt]);

  const sensitivityMatrix = useMemo(() => {
    return waccScenarios.map((scenarioWacc) =>
      capexScenarios.map((scenarioCapex) =>
        calcIntrinsicForScenario(scenarioWacc, scenarioCapex)
      )
    );
  }, [calcIntrinsicForScenario, capexScenarios, waccScenarios]);

  const valueSpread = useMemo(() => {
    const values = sensitivityMatrix.flat();
    if (values.length === 0) return 0;
    return Math.max(...values) - Math.min(...values);
  }, [sensitivityMatrix]);

  const centralValue = sensitivityMatrix[2]?.[2] ?? 0;

  const chartYAxisDomain = useMemo(() => {
    const values = projections.flatMap((item) => [item.ocf, item.capex, item.fcf]);
    return getRoundedYAxisDomain(values);
  }, [projections]);

  const horizonChanges = useMemo(() => {
    const baseFcf = baseRevenue * (ocfMargin - capexMargin);
    const horizons = [1, 3, 5, 10];

    return horizons
      .map((year) => {
        const point = projections.find((item) => item.year === year);
        if (!point || baseFcf === 0) return null;
        const change = (point.fcf - baseFcf) / Math.abs(baseFcf);
        return { label: `${year}Y`, change };
      })
      .filter((item): item is { label: string; change: number } => item !== null);
  }, [baseRevenue, capexMargin, ocfMargin, projections]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-4 lg:self-start lg:sticky lg:top-4">
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center gap-3">
                  <DCFTickerInput value={queryTicker} onSelect={onTickerSelect} />
                  {canAutoFill && (
                    <Button size="sm" onClick={onAutoFill} className="w-[10vw] min-w-[110px]">
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                      Auto-Fill
                    </Button>
                  )}
                </div>

                {queryTicker && companyName && (
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TickerLogo ticker={queryTicker} className="w-8 h-8 rounded-lg" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-snow-peak truncate">{companyName}</p>
                      {companyMeta ? <p className="text-[11px] text-mist truncate">{companyMeta}</p> : null}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {isPreparingData && <DataHuntingLoader ticker={queryTicker} compact />}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                Interactive DCF & Capital Allocator
                <Badge variant="outline" className="text-[9px] font-mono">
                  OCF - CapEx
                </Badge>
                <InfoHint text="Interactive model splitting Free Cash Flow into Operating Cash Flow inflows and Capital Expenditure outflows." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-wolf-border/40 bg-wolf-black/40 p-1">
                <button
                  type="button"
                  onClick={() => onProjectionYearsChange(5)}
                  className={cn(
                    "h-8 rounded-md text-xs font-medium border transition-colors",
                    projectionYears === 5
                      ? "bg-sunset-orange/15 text-sunset-orange border-sunset-orange/30"
                      : "text-mist border-transparent hover:text-snow-peak hover:bg-wolf-surface/70"
                  )}
                >
                  5Y
                </button>
                <button
                  type="button"
                  onClick={() => onProjectionYearsChange(10)}
                  className={cn(
                    "h-8 rounded-md text-xs font-medium border transition-colors",
                    projectionYears === 10
                      ? "bg-sunset-orange/15 text-sunset-orange border-sunset-orange/30"
                      : "text-mist border-transparent hover:text-snow-peak hover:bg-wolf-surface/70"
                  )}
                >
                  10Y
                </button>
              </div>

              <SliderField
                label="Revenue Growth"
                tooltip="Annual growth used to project future revenue. This drives OCF, CapEx, and Net FCF in every projected year."
                value={revenueGrowthRate}
                min={-0.1}
                max={0.5}
                step={0.005}
                onChange={onRevenueGrowthRateChange}
              />
              <SliderField
                label="OCF Margin"
                tooltip="Operating Cash Flow as a percentage of revenue. Higher values indicate stronger cash conversion from operations."
                value={ocfMargin}
                min={0.05}
                max={0.70}
                step={0.005}
                onChange={onOcfMarginChange}
              />
              <SliderField
                label="CapEx Margin"
                tooltip="Capital Expenditures as a percentage of revenue. This is treated as cash outflow and subtracted from OCF."
                value={capexMargin}
                min={0.01}
                max={0.35}
                step={0.005}
                onChange={onCapexMarginChange}
              />
              <SliderField
                label="WACC"
                tooltip="Weighted Average Cost of Capital used to discount future cash flows to present value."
                value={wacc}
                min={0.04}
                max={0.25}
                step={0.0025}
                onChange={onWaccChange}
              />

              <div className="rounded-lg border border-wolf-border/30 bg-wolf-black/40 p-3 space-y-1.5">
                <p className="text-[10px] text-mist uppercase tracking-wider font-medium">Capital Allocation Logic</p>
                <p className="text-xs text-mist leading-relaxed">
                  Revenue grows at {formatPercent(revenueGrowthRate, 1)}. OCF enters as positive cash, CapEx exits as negative cash, and Net FCF drives discounted intrinsic value.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="lg:col-span-8 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-sunset-orange" />
                Intrinsic Value - {ticker || "STOCK"}
                <InfoHint text="Present value per share derived from discounted Net FCF plus terminal value, net of debt and cash." />
              </CardTitle>
              <Badge variant="outline" className="text-[9px] font-mono">
                {projectionYears}Y Horizon
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <MetricCard
                label="Intrinsic Value"
                tooltip="Estimated fair value per share from the DCF engine under current assumptions."
                value={formatCurrency(valuation.intrinsicValuePerShare)}
                accent="text-snow-peak"
              />
              <MetricCard
                label="Upside vs Price"
                tooltip="Percentage difference between intrinsic value and the current market price."
                value={`${upside >= 0 ? "+" : ""}${formatPercent(upside, 1)}`}
                accent={upside >= 0 ? "text-emerald-400" : "text-rose-400"}
              />
              <MetricCard
                label="Enterprise Value"
                tooltip="Value of operations before debt and cash adjustments."
                value={formatCompactNumber(valuation.enterpriseValue)}
                accent="text-snow-peak"
              />
              <MetricCard
                label="Terminal Value"
                tooltip="Perpetual value after the explicit forecast period using Gordon Growth."
                value={formatCompactNumber(valuation.terminalValue)}
                accent="text-snow-peak"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-sunset-orange" />
                Interactive Cash Flow Breakdown
                <InfoHint text="Bars show OCF and CapEx components, while the line tracks Net FCF per projected year." />
              </CardTitle>
              <Badge variant="outline" className="text-[9px] font-mono">
                ComposedChart
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {projections.length > 0 ? (
              <>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={projections} margin={{ top: 12, right: 16, left: 6, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(125, 139, 153, 0.16)" />
                      <XAxis dataKey="label" tick={{ fill: "#9fb0bf", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fill: "#9fb0bf", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        domain={chartYAxisDomain}
                        tickFormatter={(value) => `${value < 0 ? "-$" : "$"}${Math.abs(value / 1_000_000_000).toFixed(0)}B`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0b151d",
                          border: "1px solid rgba(125, 139, 153, 0.25)",
                          borderRadius: "0.75rem",
                          color: "#f8fafc",
                        }}
                        formatter={(value, name) => {
                          const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                          if (name === "capex") return [formatShortCurrency(Math.abs(numericValue)), "CapEx"];
                          if (name === "ocf") return [formatShortCurrency(numericValue), "OCF"];
                          if (name === "fcf") return [formatShortCurrency(numericValue), "FCF"];
                          return [formatShortCurrency(numericValue), String(name)];
                        }}
                      />
                      <ReferenceLine y={0} stroke="rgba(248, 250, 252, 0.35)" strokeDasharray="2 4" />
                      <Bar dataKey="ocf" fill="#10b981" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="capex" fill="#ef4444" radius={[6, 6, 0, 0]} />
                      <Line dataKey="fcf" type="monotone" stroke="#f8fafc" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {horizonChanges.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {horizonChanges.map((item) => {
                      const positive = item.change >= 0;
                      return (
                        <span
                          key={item.label}
                          className={
                            positive
                              ? "inline-flex items-center gap-1 rounded-md border border-emerald-400/20 bg-emerald-500/15 px-2.5 py-1 text-xs font-mono text-emerald-300"
                              : "inline-flex items-center gap-1 rounded-md border border-rose-400/20 bg-rose-500/15 px-2.5 py-1 text-xs font-mono text-rose-300"
                          }
                        >
                          {item.label}: {item.change > 0 ? "+" : ""}{(item.change * 100).toFixed(1)}%
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <div className="rounded-lg border border-wolf-border/35 bg-wolf-black/35 p-3">
                  <p className="text-xs text-mist leading-relaxed">
                    As CapEx Margin increases, capital expenditures compress the Operating Cash Flow, directly impacting the Net FCF line and intrinsic valuation.
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-wolf-border/30 bg-wolf-black/40 p-8 text-center">
                <p className="text-sm text-mist">Select a ticker and click Auto-Fill to activate the interactive valuation engine.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                Sensitivity Matrix (WACC x CapEx Margin)
                <InfoHint text="Each cell recalculates intrinsic value using a specific WACC and CapEx Margin combination." />
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-mist font-medium text-left">WACC \ CapEx</th>
                    {capexScenarios.map((scenarioCapex, colIndex) => (
                      <th key={`capex-${colIndex}`} className="px-2 py-2 text-[11px] font-mono text-mist text-center whitespace-nowrap">
                        {formatPercent(scenarioCapex, 1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {waccScenarios.map((scenarioWacc, rowIndex) => (
                    <tr key={`wacc-${rowIndex}`}>
                      <td className="px-2 py-2 text-[11px] font-mono text-mist whitespace-nowrap">{formatPercent(scenarioWacc, 1)}</td>
                      {capexScenarios.map((_, colIndex) => {
                        const cellValue = sensitivityMatrix[rowIndex]?.[colIndex] ?? 0;
                        const isBaseCase = rowIndex === 2 && colIndex === 2;
                        return (
                          <td key={`cell-${rowIndex}-${colIndex}`} className="px-2 py-2">
                            <div
                              className={cn(
                                "rounded-md px-2 py-2 text-center text-xs font-mono font-semibold",
                                getHeatmapColor(cellValue, currentPrice),
                                isBaseCase && "ring-2 ring-orange-500"
                              )}
                            >
                              {formatCurrency(cellValue)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-mist">
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-700" /> Undervalued</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-700" /> Overvalued</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-orange-500" /> Base Case</span>
              <span className="font-mono">Base cell: {formatCurrency(centralValue)}</span>
              <span className="font-mono">Spread: {formatCurrency(valueSpread)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SliderField({
  label,
  tooltip,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  tooltip?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] text-mist uppercase tracking-wider font-medium">{label}</p>
          {tooltip ? <InfoHint text={tooltip} /> : null}
        </div>
        <p className="text-xs font-mono font-bold text-snow-peak">{formatPercent(value, 1)}</p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(parseFloat(event.target.value))}
        className={cn(
          "w-full h-1.5 rounded-full appearance-none cursor-pointer",
          "bg-wolf-border/60",
          "[&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5",
          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sunset-orange",
          "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-snow-peak",
          "[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5",
          "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sunset-orange",
          "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-snow-peak",
          "[&::-moz-range-track]:bg-wolf-border/60 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full"
        )}
      />
    </div>
  );
}

function MetricCard({
  label,
  tooltip,
  value,
  accent,
}: {
  label: string;
  tooltip?: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-wolf-border/30 bg-wolf-black/35 p-3">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] text-mist uppercase tracking-wider font-medium">{label}</p>
        {tooltip ? <InfoHint text={tooltip} /> : null}
      </div>
      <p className={cn("text-lg font-mono font-bold mt-1", accent ?? "text-snow-peak")}>{value}</p>
    </div>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center">
      <Info className="w-3 h-3 text-mist/70 cursor-help" />
      <div className="pointer-events-none absolute ml-5 left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-md border border-wolf-border/60 bg-wolf-black/95 px-2 py-1.5 text-[10px] leading-relaxed text-snow-peak opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </div>
    </div>
  );
}
