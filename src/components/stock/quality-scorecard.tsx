"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  QualityScoreResult,
  QualityDimension,
  QualityGrade,
  QualityFlag,
  QualityMode,
} from "@/lib/calculations/quality-score";

// ─── Design tokens ────────────────────────────────────────────────────────────

const GRADE_COLOR: Record<QualityGrade, string> = {
  "A+": "text-emerald-400",
  A:   "text-bullish",
  B:   "text-teal-400",
  C:   "text-golden-hour",
  D:   "text-sunset-orange",
  F:   "text-bearish",
};

const GRADE_BORDER: Record<QualityGrade, string> = {
  "A+": "border-l-emerald-400",
  A:   "border-l-bullish",
  B:   "border-l-teal-400",
  C:   "border-l-golden-hour",
  D:   "border-l-sunset-orange",
  F:   "border-l-bearish",
};

const GRADE_CHIP: Record<QualityGrade, string> = {
  "A+": "bg-emerald-400/10 text-emerald-400 border-emerald-400/30",
  A:   "bg-bullish/10 text-bullish border-bullish/30",
  B:   "bg-teal-400/10 text-teal-400 border-teal-400/30",
  C:   "bg-golden-hour/10 text-golden-hour border-golden-hour/30",
  D:   "bg-sunset-orange/10 text-sunset-orange border-sunset-orange/30",
  F:   "bg-bearish/10 text-bearish border-bearish/30",
};

function barColor(score: number): string {
  if (score >= 78) return "bg-bullish";
  if (score >= 65) return "bg-teal-400";
  if (score >= 50) return "bg-golden-hour";
  if (score >= 35) return "bg-sunset-orange";
  return "bg-bearish";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ score, h = "h-1" }: { score: number; h?: string }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-wolf-border/30", h)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", barColor(score))}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function MetricRow({
  label, value, score, tooltip,
}: {
  label: string;
  value: string;
  score: number;
  tooltip: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_80px] gap-3 items-center py-1.5">
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[11px] text-mist truncate">{label}</span>
        <Tooltip content={tooltip} side="right">
          <Info className="w-3 h-3 text-mist/35 hover:text-mist/70 transition-colors shrink-0 cursor-help" />
        </Tooltip>
      </div>
      <span className="font-mono text-[11px] text-snow-peak whitespace-nowrap">{value}</span>
      <div className="flex items-center gap-1.5">
        <ScoreBar score={score} h="h-1" />
        <span className="text-[10px] font-mono text-mist/60 w-6 text-right shrink-0">
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}

function DimensionRow({ dimension }: { dimension: QualityDimension }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-lg border border-wolf-border/30 border-l-2 bg-wolf-black/15 overflow-hidden transition-colors",
        GRADE_BORDER[dimension.grade]
      )}
    >
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-wolf-black/30 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Grade chip */}
        <span
          className={cn(
            "shrink-0 inline-flex items-center justify-center h-5 w-7 rounded text-[10px] font-bold border",
            GRADE_CHIP[dimension.grade]
          )}
        >
          {dimension.grade}
        </span>

        {/* Name */}
        <span className="text-xs font-semibold text-snow-peak shrink-0 w-28">
          {dimension.name}
        </span>

        {/* Summary */}
        <span className="flex-1 text-[10px] text-mist/70 truncate hidden sm:block">
          {dimension.summary}
        </span>

        {/* Score bar + number */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-20 hidden md:block">
            <ScoreBar score={dimension.score} h="h-1" />
          </div>
          <span className="text-xs font-mono text-mist/80 w-6 text-right">
            {Math.round(dimension.score)}
          </span>
          {expanded
            ? <ChevronUp  className="h-3 w-3 text-mist/50" />
            : <ChevronDown className="h-3 w-3 text-mist/50" />}
        </div>
      </button>

      {/* Expanded metrics */}
      {expanded && dimension.metrics.length > 0 && (
        <div className="border-t border-wolf-border/20 px-3 pb-2 pt-1 divide-y divide-wolf-border/10">
          {dimension.metrics.map((m) => (
            <MetricRow key={m.label} {...m} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Overall score bar with gradient segments ─────────────────────────────────

function OverallBar({ score }: { score: number }) {
  // 5 segments: F(0-35) D(35-50) C(50-65) B(65-78) A(78-100)
  const segments = [
    { end: 35,  color: "bg-bearish"       },
    { end: 50,  color: "bg-sunset-orange" },
    { end: 65,  color: "bg-golden-hour"   },
    { end: 78,  color: "bg-teal-400"      },
    { end: 100, color: "bg-bullish"       },
  ];

  return (
    <div className="relative h-2 w-full rounded-full bg-wolf-border/30 overflow-hidden">
      {/* Colored fill up to score */}
      <div
        className={cn("h-full rounded-full transition-all duration-700", barColor(score))}
        style={{ width: `${score}%` }}
      />
      {/* Segment tick marks */}
      {segments.slice(0, -1).map((s) => (
        <div
          key={s.end}
          className="absolute top-0 h-full w-px bg-wolf-black/40"
          style={{ left: `${s.end}%` }}
        />
      ))}
    </div>
  );
}

// ─── Grade ring ───────────────────────────────────────────────────────────────

function GradeRing({ grade, headline }: { grade: QualityGrade; headline: string }) {
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div
        className={cn(
          "flex items-center justify-center w-12 h-12 rounded-xl border-2 text-xl font-extrabold",
          GRADE_CHIP[grade],
        )}
      >
        {grade}
      </div>
      <p className={cn("text-[9px] text-center leading-tight max-w-[56px]", GRADE_COLOR[grade])}>
        {headline}
      </p>
    </div>
  );
}

// ─── Flag badge ───────────────────────────────────────────────────────────────

const FLAG_CONFIG: Record<QualityFlag, { label: string; color: string; tooltip: string }> = {
  non_recurring_charges: {
    label: "Non-Recurring Charges",
    color: "bg-golden-hour/10 text-golden-hour border-golden-hour/30",
    tooltip: "Revenue and FCF are growing but EPS is declining — likely caused by one-off accounting charges that depress reported earnings without impacting cash generation.",
  },
  high_cash_quality: {
    label: "High Cash Quality",
    color: "bg-bullish/10 text-bullish border-bullish/30",
    tooltip: "FCF / Net Income conversion ratio consistently above 1× — the company generates more cash than its reported earnings suggest. Earnings quality is high.",
  },
  value_creator: {
    label: "Value Creator",
    color: "bg-teal-400/10 text-teal-400 border-teal-400/30",
    tooltip: "ROIC exceeds the estimated WACC — the business earns a return on capital above its cost of capital, creating economic value for shareholders.",
  },
  margin_compression: {
    label: "Margin Compression",
    color: "bg-sunset-orange/10 text-sunset-orange border-sunset-orange/30",
    tooltip: "Net margins in the most recent two years are significantly lower than in earlier years of the analysis window. Monitor for structural deterioration.",
  },
  leverage_risk: {
    label: "Leverage Risk",
    color: "bg-bearish/10 text-bearish border-bearish/30",
    tooltip: "Net Debt / EBITDA exceeds 3× — elevated financial leverage may constrain future capital allocation flexibility or increase default risk in a downturn.",
  },
};

function FlagBadge({ flag }: { flag: QualityFlag }) {
  const cfg = FLAG_CONFIG[flag];
  return (
    <Tooltip content={cfg.tooltip} side="top">
      <span
        className={cn(
          "inline-flex items-center text-[9px] font-medium rounded border px-1.5 py-0.5 cursor-help",
          cfg.color
        )}
      >
        {cfg.label}
      </span>
    </Tooltip>
  );
}

// ─── Mode badge ───────────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: QualityMode }) {
  return (
    <Tooltip
      content={
        mode === "deep"
          ? "Deep analysis: 10 years of AlphaVantage data loaded. Enables 10Y CAGR, margin stability, and consistency metrics."
          : "Standard analysis: 4 most recent annual periods from Yahoo Finance. Load 20Y data to unlock Deep mode."
      }
      side="right"
    >
      <span
        className={cn(
          "inline-flex items-center text-[9px] font-semibold rounded border px-1.5 py-0.5 cursor-help",
          mode === "deep"
            ? "bg-teal-400/10 text-teal-400 border-teal-400/30"
            : "bg-wolf-border/20 text-mist/60 border-wolf-border/30"
        )}
      >
        {mode === "deep" ? "10Y Analysis" : "4Y Analysis"}
      </span>
    </Tooltip>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface QualityScorecardProps {
  result: QualityScoreResult;
  compact?: boolean;
}

export function QualityScorecard({ result, compact = false }: QualityScorecardProps) {
  if (compact) {
    return (
      <Tooltip
        content={
          <div className="space-y-0.5">
            <p className="font-semibold">{result.headline}</p>
            <p className="text-mist text-[10px]">Score: {Math.round(result.overall)}/100</p>
            {result.dimensions.map((d) => (
              <p key={d.key} className="text-[10px] text-mist/80">
                {d.name}: {d.grade}
              </p>
            ))}
          </div>
        }
        side="bottom"
      >
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 cursor-help",
            GRADE_CHIP[result.grade]
          )}
        >
          <span className={cn("text-xs font-bold", GRADE_COLOR[result.grade])}>
            {result.grade}
          </span>
          <span className="text-[10px] text-mist hidden sm:inline">
            {result.headline}
          </span>
        </span>
      </Tooltip>
    );
  }

  const windowLabel  = result.mode === "deep" ? "10Y" : "4Y";
  const sourceLabel  = result.mode === "deep" ? "AlphaVantage" : "Yahoo Finance";

  return (
    <Card className="border-wolf-border/40 bg-gradient-to-br from-wolf-surface/95 via-wolf-surface/85 to-wolf-black/80">
      <CardContent className="p-5 space-y-4">

        {/* ── Header ── */}
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-snow-peak">Quality Score</h3>
              <ModeBadge mode={result.mode} />
            </div>

            {/* Sector percentile */}
            <p className="text-[11px] text-mist/60 mt-0.5">
              Top {result.sectorPercentile}% in {result.sector} · {windowLabel} analysis
            </p>

            {/* Overall score bar */}
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-mist/50">
                  Overall
                </span>
                <span className="text-xs font-mono font-semibold text-snow-peak">
                  {Math.round(result.overall)} <span className="text-mist/50 font-normal">/ 100</span>
                </span>
              </div>
              <OverallBar score={result.overall} />
              {/* Zone labels */}
              <div className="flex justify-between text-[8px] text-mist/30 px-0.5">
                <span>F</span>
                <span>D</span>
                <span>C</span>
                <span>B</span>
                <span>A</span>
              </div>
            </div>
          </div>

          <GradeRing grade={result.grade} headline={result.headline} />
        </div>

        {/* ── Quality flags ── */}
        {result.flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {result.flags.map((flag) => (
              <FlagBadge key={flag} flag={flag} />
            ))}
          </div>
        )}

        {/* ── Dimensions ── */}
        <div className="space-y-1.5">
          {result.dimensions.map((dimension) => (
            <DimensionRow key={dimension.key} dimension={dimension} />
          ))}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-start gap-1.5 pt-1 border-t border-wolf-border/15">
          <Info className="w-3 h-3 text-mist/30 mt-0.5 shrink-0" />
          <p className="text-[9px] text-mist/35 leading-relaxed">
            Sector-relative percentile scoring vs {result.sector} peers.
            {windowLabel} window · ROIC vs WACC spread · FCF/NI earnings quality.
            Source: {sourceLabel}.
            {result.mode === "standard" ? " Load 20Y data to upgrade to Deep (10Y) analysis." : ""}
          </p>
        </div>

      </CardContent>
    </Card>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function QualityScorecardSkeleton() {
  return (
    <Card className="border-wolf-border/40 bg-gradient-to-br from-wolf-surface/95 via-wolf-surface/85 to-wolf-black/80">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton shape="line" className="h-4 w-28" />
            <Skeleton shape="line" className="h-3 w-56 opacity-60" />
            <Skeleton className="h-2 w-full mt-3 rounded-full" />
          </div>
          <Skeleton shape="rect" className="h-12 w-12 rounded-xl shrink-0" />
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
