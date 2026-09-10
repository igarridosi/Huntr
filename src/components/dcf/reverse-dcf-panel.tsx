"use client";

import { useMemo } from "react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { TickerLogo } from "@/components/ui/ticker-logo";
import {
  compareToHistory,
  describeReverseDCF,
  solveReverseDCF,
  type ReverseDCFVariable,
} from "@/lib/calculations/reverse-dcf";
import type { DCFInputs } from "@/lib/calculations";
import {
  IMPLAUSIBLE_MARGIN,
  type MarginHistory,
} from "@/lib/calculations/margin-history";
import { AlertTriangle, Search, TrendingDown, TrendingUp } from "lucide-react";

interface ReverseDCFPanelProps {
  inputs: DCFInputs;
  /** Enough to know whose numbers these are without leaving the tab. */
  ticker: string;
  companyName?: string | null;
  sector?: string | null;
  /** The company's own record, as decimals. Null when there is not enough history. */
  revenueCAGR5Y: number | null;
  revenueCAGR10Y: number | null;
  /** Realised FCF margin over the same windows, for the margin solve. */
  fcfMargin5Y: number | null;
  /**
   * The realised margin year by year, and whether it can be compared against.
   *
   * A band the market can be measured against has to describe one company over
   * the whole window. Several did not - a disposal, an acquisition or a
   * restatement leaves a series whose years are not the same business - and
   * the panel presented all of them the same way, with a green verdict on top.
   */
  marginHistory?: MarginHistory | null;
}

const VARIABLES: ReadonlyArray<{
  key: ReverseDCFVariable;
  label: string;
  /** What the solved figure means, in the fewest words that stay true. */
  hint: string;
}> = [
  {
    key: "growthRatePhase1",
    label: "Revenue growth",
    hint: "Phase 1 growth the price already assumes",
  },
  {
    key: "terminalFCFMargin",
    label: "Terminal FCF margin",
    hint: "The margin the business has to reach",
  },
  {
    key: "wacc",
    label: "Discount rate",
    hint: "The return the market is demanding",
  },
  {
    key: "terminalGrowthRate",
    label: "Perpetual growth",
    hint: "Growth assumed forever, after the horizon",
  },
];

/**
 * Reverse DCF: what the market is already assuming.
 *
 * A forward DCF invites anchoring. You move sliders until the number looks
 * reasonable, it lands near the price, and the exercise confirms what you
 * already believed. This fixes the price as the answer and solves for the
 * assumption behind it, which turns "what is it worth?" into "do I believe
 * this?" - a question that is much easier to answer honestly.
 *
 * All four solves are shown at once rather than behind a selector. Each one
 * explains the same price with a different variable, and they are most useful
 * next to each other: a growth rate the company has beaten every year reads
 * very differently when the margin beside it is one nobody in the industry has
 * ever earned. Behind a tab, that comparison became four separate readings
 * taken minutes apart.
 */
export function ReverseDCFPanel({
  inputs,
  ticker,
  companyName,
  sector,
  revenueCAGR5Y,
  revenueCAGR10Y,
  fcfMargin5Y,
  marginHistory = null,
}: ReverseDCFPanelProps) {
  // A history that cannot be compared against is not a weaker benchmark, it is
  // not a benchmark. The implied figure still stands on its own.
  const historyIsUsable = marginHistory ? marginHistory.comparable : true;
  const solves = useMemo(
    () =>
      VARIABLES.map((variable) => {
        const solved = solveReverseDCF(inputs, variable.key);

        // Only growth and margin have a company record to be judged against. A
        // discount rate is a property of the market's appetite, not of the
        // business, so there is nothing to compare it to and we say nothing
        // rather than inventing a benchmark.
        const comparison =
          solved === null
            ? null
            : variable.key === "growthRatePhase1"
              ? compareToHistory(solved.impliedValue, revenueCAGR5Y, revenueCAGR10Y)
              : variable.key === "terminalFCFMargin" && historyIsUsable
                ? compareToHistory(solved.impliedValue, fcfMargin5Y, null)
                : null;

        return { variable, solved, comparison };
      }),
    [inputs, revenueCAGR5Y, revenueCAGR10Y, fcfMargin5Y, historyIsUsable]
  );

  if (!(inputs.currentPrice > 0) || !(inputs.baseRevenue > 0)) {
    return (
      <div className="rounded-xl bg-snow-peak/[0.025] p-6 text-center ring-1 ring-inset ring-wolf-border/35">
        <Search className="mx-auto mb-2 h-5 w-5 text-mist/50" />
        <p className="text-sm text-mist">
          Load a ticker and populate the model to see what the market is pricing in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Whose numbers these are. The tab used to show a percentage with
          nothing on screen naming the company it belonged to. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-snow-peak/[0.025] px-3 py-2.5 ring-1 ring-inset ring-wolf-border/35">
        <div className="flex min-w-0 items-center gap-2.5">
          <TickerLogo ticker={ticker} className="h-7 w-7 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold tracking-[-0.01em] text-snow-peak">
              {ticker}
            </p>
            <p className="truncate text-[11px] text-mist/70">
              {companyName ?? "—"}
              {sector ? ` · ${sector}` : ""}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
            Price solved against
          </p>
          <p className="font-mono text-sm font-semibold tabular-nums text-snow-peak">
            {formatCurrency(inputs.currentPrice)}
          </p>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-mist/70">
        Each panel fixes today&apos;s price as the answer and solves for one
        assumption, leaving everything else exactly as you set it on the DCF
        tab. They are four alternative explanations of the same price, not four
        conditions that hold at once.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {solves.map(({ variable, solved, comparison }) => (
          <SolveCard
            key={variable.key}
            label={variable.label}
            hint={variable.hint}
            solved={solved}
            comparison={comparison}
            inputs={inputs}
            marginHistory={
              variable.key === "terminalFCFMargin" ? marginHistory : null
            }
          />
        ))}
      </div>
    </div>
  );
}

function SolveCard({
  label,
  hint,
  solved,
  comparison,
  inputs,
  marginHistory,
}: {
  label: string;
  hint: string;
  solved: ReturnType<typeof solveReverseDCF>;
  comparison: ReturnType<typeof compareToHistory> | null;
  inputs: DCFInputs;
  marginHistory?: MarginHistory | null;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-snow-peak/[0.025] p-3.5 ring-1 ring-inset ring-wolf-border/35">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
          {label}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-mist/70">{hint}</p>
      </div>

          {/* Why the record is not on offer, where that is the case. Saying
          nothing would leave the implied figure looking unremarkable
          rather than unjudged. */}
      {marginHistory && !marginHistory.comparable ? (
        <div className="space-y-1.5 rounded-lg bg-golden-hour/[0.07] p-2 ring-1 ring-inset ring-golden-hour/25">
          <p className="text-[10px] font-medium text-golden-hour">
            No usable margin record
          </p>
          {marginHistory.reasons.map((reason) => (
            <p key={reason} className="text-[10px] leading-relaxed text-mist/80">
              {reason}
            </p>
          ))}
        </div>
      ) : null}

      {/* The years themselves, not just the median. A single figure gives
          no way to see that it came from a series that jumps. */}
      {marginHistory && marginHistory.series.length > 0 ? (
        <div className="rounded-lg bg-snow-peak/[0.03] p-2 ring-1 ring-inset ring-wolf-border/35">
          <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.08em] text-mist/55">
            Realised FCF margin by year
          </p>
          <div className="space-y-0.5">
            {marginHistory.series.map((entry) => (
              <div
                key={entry.year}
                className="flex items-baseline justify-between gap-3 font-mono text-[10px] tabular-nums"
              >
                <span className="text-mist/70">{entry.year}</span>
                <span
                  className={cn(
                    entry.margin > IMPLAUSIBLE_MARGIN
                      ? "text-golden-hour"
                      : "text-snow-peak"
                  )}
                >
                  {formatPercent(entry.margin, 1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {solved === null ? (
        /* Reporting a clamped bound as though it were an answer would be worse
           than saying the price is not reachable this way. */
        <div className="flex flex-1 items-start gap-2 rounded-lg bg-golden-hour/[0.08] p-2.5 ring-1 ring-inset ring-golden-hour/30">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-golden-hour" />
          <p className="text-[11px] leading-relaxed text-mist/85">
            No value of this assumption alone reaches today&apos;s price within a
            defensible range. Something the other inputs carry has to explain it.
          </p>
        </div>
      ) : (
        <>
          <p className="font-mono text-2xl font-semibold tabular-nums tracking-[-0.03em] text-sunset-orange">
            {formatPercent(solved.impliedValue, 1)}
          </p>

          {comparison && comparison.history5Y !== null ? (
            <RecordComparison
              implied={comparison.implied}
              history5Y={comparison.history5Y}
              history10Y={comparison.history10Y}
              pessimistic={comparison.marketIsPessimistic}
              optimistic={comparison.marketIsOptimistic}
            />
          ) : null}

          <p className="text-[11px] leading-relaxed text-mist/80">
            {describeReverseDCF(solved, inputs, comparison ?? undefined)}
          </p>

          <p className="mt-auto pt-1 text-[9px] text-mist/40">
            Bisection, {solved.iterations} steps · within{" "}
            {Math.abs(solved.residual).toFixed(3)} of the price
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The implied assumption next to what the company has actually managed.
 *
 * This is the part that does the work. A fair-value estimate is an opinion you
 * have to weigh; "the market expects 1.8% and the company has compounded at
 * 12%" is a claim you can go and check.
 */
function RecordComparison({
  implied,
  history5Y,
  history10Y,
  pessimistic,
  optimistic,
}: {
  implied: number;
  history5Y: number;
  history10Y: number | null;
  pessimistic: boolean;
  optimistic: boolean;
}) {
  const verdict = pessimistic
    ? {
        tone: "bullish" as const,
        icon: <TrendingUp className="h-3 w-3" />,
        text: "The market is assuming materially less than this company has delivered.",
      }
    : optimistic
      ? {
          tone: "bearish" as const,
          icon: <TrendingDown className="h-3 w-3" />,
          text: "The market is assuming more than this company has ever delivered.",
        }
      : null;

  return (
    <div className="space-y-2 rounded-lg bg-snow-peak/[0.03] p-2 ring-1 ring-inset ring-wolf-border/35">
      <div className="grid grid-cols-3 gap-1.5">
        <RecordCell label="Implied" value={implied} accent />
        <RecordCell label="5Y" value={history5Y} />
        <RecordCell label="10Y" value={history10Y} />
      </div>

      {verdict ? (
        <div
          className={cn(
            "flex items-start gap-1.5 rounded-md p-2 ring-1 ring-inset",
            verdict.tone === "bullish"
              ? "bg-bullish/[0.07] ring-bullish/25"
              : "bg-bearish/[0.07] ring-bearish/25"
          )}
        >
          <span
            className={cn(
              "mt-0.5 shrink-0",
              verdict.tone === "bullish" ? "text-bullish" : "text-bearish"
            )}
          >
            {verdict.icon}
          </span>
          <p className="text-[10px] leading-relaxed text-mist/85">{verdict.text}</p>
        </div>
      ) : null}
    </div>
  );
}

function RecordCell({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md bg-snow-peak/[0.04] p-1.5 ring-1 ring-inset ring-wolf-border/35">
      <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-mist/60">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-xs font-semibold tabular-nums",
          accent ? "text-sunset-orange" : "text-snow-peak"
        )}
      >
        {value === null ? "—" : formatPercent(value, 1)}
      </p>
    </div>
  );
}
