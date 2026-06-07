"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  QualityScoreResult,
  QualityDimension,
  QualityGrade,
} from "@/lib/calculations/quality-score";

// ─── Grade → color ────────────────────────────────────────────────────────────

const GRADE_COLOR: Record<QualityGrade, string> = {
  "A+": "text-emerald-400",
  A:   "text-bullish",
  B:   "text-teal-400",
  C:   "text-golden-hour",
  D:   "text-sunset-orange",
  F:   "text-bearish",
};

const GRADE_BG: Record<QualityGrade, string> = {
  "A+": "bg-emerald-400/10 border-emerald-400/25",
  A:   "bg-bullish/10 border-bullish/25",
  B:   "bg-teal-400/10 border-teal-400/25",
  C:   "bg-golden-hour/10 border-golden-hour/25",
  D:   "bg-sunset-orange/10 border-sunset-orange/25",
  F:   "bg-bearish/10 border-bearish/25",
};

const SCORE_BAR_COLOR = (score: number) => {
  if (score >= 78) return "bg-bullish";
  if (score >= 65) return "bg-teal-400";
  if (score >= 50) return "bg-golden-hour";
  if (score >= 35) return "bg-sunset-orange";
  return "bg-bearish";
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-wolf-border/40">
      <div
        className={cn("h-full rounded-full transition-all duration-500", SCORE_BAR_COLOR(score))}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function MetricRow({ label, value, score, tooltip }: {
  label: string;
  value: string;
  score: number;
  tooltip: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex-1 min-w-0">
        <Tooltip content={tooltip} side="top">
          <span className="text-[11px] text-mist cursor-help border-b border-dashed border-mist/30 hover:text-snow-peak transition-colors">
            {label}
          </span>
        </Tooltip>
      </div>
      <span className="font-mono text-xs text-snow-peak shrink-0 w-20 text-right">
        {value}
      </span>
      <div className="w-16 shrink-0">
        <ScoreBar score={score} />
      </div>
    </div>
  );
}

function DimensionCard({ dimension }: { dimension: QualityDimension }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-wolf-border/40 bg-wolf-black/20 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-wolf-black/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Grade chip */}
        <span
          className={cn(
            "inline-flex items-center justify-center h-6 w-7 rounded text-xs font-bold border shrink-0",
            GRADE_BG[dimension.grade],
            GRADE_COLOR[dimension.grade]
          )}
        >
          {dimension.grade}
        </span>

        {/* Name + summary */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-semibold text-snow-peak leading-tight">
            {dimension.name}
          </p>
          <p className="text-[10px] text-mist/80 truncate">{dimension.summary}</p>
        </div>

        {/* Score bar + expand toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-16 hidden sm:block">
            <ScoreBar score={dimension.score} />
          </div>
          <span className="text-xs font-mono text-mist w-8 text-right">
            {Math.round(dimension.score)}
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-mist" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-mist" />
          )}
        </div>
      </button>

      {expanded && dimension.metrics.length > 0 && (
        <div className="border-t border-wolf-border/30 px-3 pb-2 pt-1">
          {dimension.metrics.map((m) => (
            <MetricRow key={m.label} {...m} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface QualityScorecardProps {
  result: QualityScoreResult;
  /** Show compact inline variant (e.g. inside ticker header) */
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
            GRADE_BG[result.grade]
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Quality Score</CardTitle>
            <p className="text-xs text-mist mt-0.5">
              Composite fundamental analysis across 5 dimensions
            </p>
          </div>

          {/* Overall grade */}
          <div className="flex flex-col items-center shrink-0">
            <span
              className={cn(
                "flex items-center justify-center w-14 h-14 rounded-xl border-2 text-2xl font-extrabold",
                GRADE_BG[result.grade],
                GRADE_COLOR[result.grade]
              )}
            >
              {result.grade}
            </span>
            <p className="text-[10px] text-mist mt-1 text-center leading-tight max-w-[72px]">
              {result.headline}
            </p>
          </div>
        </div>

        {/* Overall score bar */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-mist uppercase tracking-wider">
              Overall Score
            </span>
            <span className="text-xs font-mono font-semibold text-snow-peak">
              {Math.round(result.overall)} / 100
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-wolf-border/40">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                SCORE_BAR_COLOR(result.overall)
              )}
              style={{ width: `${result.overall}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-1.5">
        {result.dimensions.map((dimension) => (
          <DimensionCard key={dimension.key} dimension={dimension} />
        ))}

        {/* Rule 2 + Rule 4 — explicit methodology + source note */}
        <div className="border-t border-wolf-border/20 pt-2 mt-1 space-y-0.5">
          <p className="text-[9px] text-mist/40 text-right leading-relaxed">
            Growth = CAGR (3Y/5Y/10Y) · Margins = TTM GAAP · ROIC = NOPAT ÷ Invested Capital (TTM)
          </p>
          <p className="text-[9px] text-mist/40 text-right">
            Fundamentals: last reported annual period · Source: AlphaVantage / Yahoo Finance
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function QualityScorecardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <Skeleton shape="line" className="h-4 w-28" />
            <Skeleton shape="line" className="h-3 w-48 opacity-70" />
          </div>
          <Skeleton shape="rect" className="h-14 w-14 rounded-xl" />
        </div>
        <Skeleton className="h-2 w-full mt-3 rounded-full" />
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </CardContent>
    </Card>
  );
}
