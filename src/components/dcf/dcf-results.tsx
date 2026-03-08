"use client";

import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatCompactNumber } from "@/lib/utils";
import type { DCFResult } from "@/lib/calculations/dcf";
import { TrendingUp, TrendingDown, Shield, Target, Building2, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";

interface DCFResultsProps {
  result: DCFResult;
  ticker: string;
}

export function DCFResults({ result, ticker }: DCFResultsProps) {
  const isUndervalued = result.upside > 0;

  return (
    <div className="space-y-4">
      {/* Main Valuation Card */}
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border p-5",
          isUndervalued
            ? "border-[#4DC990]/30 bg-gradient-to-br from-[#4DC990]/5 to-transparent"
            : "border-bearish/30 bg-gradient-to-br from-bearish/5 to-transparent"
        )}
      >
        <div className="absolute top-3 right-3">
          <Badge
            variant={isUndervalued ? "bullish" : "bearish"}
            className="text-xs font-mono"
          >
            {isUndervalued ? "UNDERVALUED" : "OVERVALUED"}
          </Badge>
        </div>

        <p className="text-[11px] text-mist uppercase tracking-wider font-medium mb-1">
          Intrinsic Value — {ticker}
        </p>
        <p className="text-3xl font-mono font-black text-snow-peak tabular-nums tracking-tight">
          {formatCurrency(result.intrinsicValuePerShare)}
        </p>

        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1.5">
            {isUndervalued ? (
              <TrendingUp className="w-4 h-4 text-[#4DC990]" />
            ) : (
              <TrendingDown className="w-4 h-4 text-bearish" />
            )}
            <span
              className={cn(
                "text-sm font-mono font-bold",
                isUndervalued ? "text-[#4DC990]" : "text-bearish"
              )}
            >
              {result.upside > 0 ? "+" : ""}
              {formatPercent(result.upside, 1)}
            </span>
          </div>
          <span className="text-xs text-mist">
            vs. {formatCurrency(result.currentPrice)} current
          </span>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <MetricTile
          icon={<Shield className="w-3.5 h-3.5" />}
          label="Margin of Safety"
          value={formatPercent(result.marginOfSafety, 1)}
          variant={result.marginOfSafety > 0 ? "bullish" : "bearish"}
        />
        <MetricTile
          icon={<Building2 className="w-3.5 h-3.5" />}
          label="Enterprise Value"
          value={formatCompactNumber(result.enterpriseValue)}
        />
        <MetricTile
          icon={<Banknote className="w-3.5 h-3.5" />}
          label="Equity Value"
          value={formatCompactNumber(result.equityValue)}
        />
        <MetricTile
          icon={<Target className="w-3.5 h-3.5" />}
          label="Net Debt"
          value={formatCompactNumber(result.netDebt)}
        />
      </div>

      {/* Value Bridge */}
      <div className="rounded-lg border border-wolf-border/30 bg-wolf-black/40 p-3 space-y-2">
        <p className="text-[10px] text-mist uppercase tracking-wider font-medium">
          Value Bridge
        </p>
        <BridgeRow label="PV of Projected FCFs" value={result.sumPVFCF} />
        <BridgeRow label="PV of Terminal Value" value={result.pvTerminalValue} />
        <div className="border-t border-wolf-border/30 pt-1.5">
          <BridgeRow label="Enterprise Value" value={result.enterpriseValue} bold />
        </div>
        <BridgeRow label="— Net Debt" value={-result.netDebt} />
        <div className="border-t border-wolf-border/30 pt-1.5">
          <BridgeRow label="Equity Value" value={result.equityValue} bold />
        </div>
      </div>

      {/* Terminal Value Weight */}
      <div className="rounded-lg border border-wolf-border/30 bg-wolf-black/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-mist uppercase tracking-wider font-medium">
            Terminal Value Weight
          </p>
          <span className="text-xs font-mono font-bold text-golden-hour">
            {result.enterpriseValue > 0
              ? formatPercent(result.pvTerminalValue / result.enterpriseValue, 1)
              : "N/A"}
          </span>
        </div>
        <div className="h-2 rounded-full bg-wolf-border/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sunset-orange to-golden-hour transition-all"
            style={{
              width: `${
                result.enterpriseValue > 0
                  ? Math.min(
                      100,
                      (result.pvTerminalValue / result.enterpriseValue) * 100
                    )
                  : 0
              }%`,
            }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-mist/50 font-mono">
          <span>FCFs</span>
          <span>Terminal</span>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  variant?: "default" | "bullish" | "bearish";
}) {
  return (
    <div className="rounded-lg border border-wolf-border/30 bg-wolf-black/40 p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-mist">{icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-sm font-mono font-bold tabular-nums",
          variant === "bullish" && "text-[#4DC990]",
          variant === "bearish" && "text-bearish",
          variant === "default" && "text-snow-peak"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function BridgeRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn(
          "text-xs",
          bold ? "text-snow-peak font-medium" : "text-mist"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-xs font-mono tabular-nums",
          bold ? "text-snow-peak font-bold" : "text-snow-peak/80"
        )}
      >
        {formatCompactNumber(value)}
      </span>
    </div>
  );
}
