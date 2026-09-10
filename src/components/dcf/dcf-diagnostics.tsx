"use client";

import { cn, formatCompactNumber, formatPercent } from "@/lib/utils";
import type { SourcedDCFFields } from "@/lib/calculations/dcf-inputs-source";
import type { AnchorWarning } from "@/lib/calculations/dcf-anchors";
import type { CoherenceWarning } from "@/lib/calculations/dcf-scenario-coherence";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Everything the model has to say about itself, in one column.
 *
 * The assumptions panel had grown into two different jobs sharing a scroll
 * container: controls you manipulate, and findings you read. They compete -
 * a warning about the bear case appears above the slider that caused it, so
 * acting on the warning means scrolling past it, and the warnings push the
 * controls off screen as they accumulate.
 *
 * Splitting them means the left column answers "what am I assuming?" and this
 * one answers "what is wrong with it?", and neither pushes the other around.
 */
interface DCFDiagnosticsProps {
  anchorWarnings: AnchorWarning[];
  coherenceWarnings: CoherenceWarning[];
  /** The sourced figures, for the share-count and freshness checks. */
  fields: SourcedDCFFields | null;
  onShareCountBasisChange?: (basis: "filings" | "implied") => void;
  /** The scenario comparison table, passed as content so this stays presentational. */
  scenarioTable?: React.ReactNode;
  /** The balance-sheet and sources panel. */
  balanceSheet?: React.ReactNode;
}

/**
 * How many findings the panel is holding.
 *
 * Exported because the control that hides the whole column lives outside it
 * and has to keep showing the count - a panel that can be folded away without
 * saying it is concealing four warnings is worse than no panel. One definition
 * so the two can never disagree.
 */
export function countDiagnostics(params: {
  anchorWarnings: AnchorWarning[];
  coherenceWarnings: CoherenceWarning[];
  fields: SourcedDCFFields | null;
}): number {
  const capCheck = params.fields?.marketCapCheck ?? null;
  const staleBalance = [params.fields?.cash, params.fields?.financialDebt].some(
    (field) => field?.source === "sec" && field.stale
  );
  return (
    params.anchorWarnings.length +
    params.coherenceWarnings.length +
    (capCheck !== null && !capCheck.agrees ? 1 : 0) +
    (staleBalance ? 1 : 0)
  );
}

export function DCFDiagnostics({
  anchorWarnings,
  coherenceWarnings,
  fields,
  onShareCountBasisChange,
  scenarioTable,
  balanceSheet,
}: DCFDiagnosticsProps) {
  const capCheck = fields?.marketCapCheck ?? null;
  const shareCount = fields?.shareCount ?? null;
  const shareCountDisagrees = capCheck !== null && !capCheck.agrees;

  // A balance sheet older than two quarters is describing a company that has
  // reported since.
  const staleBalance = [fields?.cash, fields?.financialDebt].find(
    (field) => field?.source === "sec" && field.stale
  );

  const total = countDiagnostics({ anchorWarnings, coherenceWarnings, fields });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
            Checks
          </p>
          {total > 0 ? (
            <span className="rounded-md bg-golden-hour/15 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-golden-hour">
              {total}
            </span>
          ) : null}
        </div>

        {/* An empty tray has to say it is empty. A blank space here reads as
            something still loading, and the absence of warnings is itself a
            finding worth stating once. */}
        {total === 0 ? (
          <div className="flex items-start gap-2 rounded-lg bg-bullish/[0.06] p-2.5 ring-1 ring-inset ring-bullish/20">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bullish" />
            <p className="text-[11px] leading-relaxed text-mist/85">
              Nothing to flag. The assumptions sit inside the company&apos;s own
              record and the three scenarios are in order.
            </p>
          </div>
        ) : null}

        {/* Ordered strongest evidence first by each collector. Coherence comes
            second because it is about the shape of the scenario set rather
            than about the company. */}
        {anchorWarnings.map((warning) => (
          <DiagnosticRow
            key={warning.id}
            tone={warning.severity === "warning" ? "warning" : "muted"}
            message={warning.message}
          />
        ))}
        {coherenceWarnings.map((warning) => (
          <DiagnosticRow key={warning.id} tone="warning" message={warning.message} />
        ))}

        {staleBalance ? (
          <DiagnosticRow
            tone="muted"
            message={`This valuation uses balance-sheet data from ${staleBalance.asOf}. Check it against the latest report.`}
          />
        ) : null}

        {/* The one check that comes with a decision attached, so it carries
            its own control rather than sending the reader elsewhere. Every
            per-share figure in the middle column is scaled by whichever of
            these is selected. */}
        {shareCountDisagrees && capCheck && shareCount ? (
          <div className="space-y-2.5 rounded-lg bg-golden-hour/[0.08] p-2.5 ring-1 ring-inset ring-golden-hour/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-golden-hour" />
              <p className="text-[11px] font-medium text-golden-hour">
                Share count does not reconcile with market cap
              </p>
            </div>

            <div className="space-y-1">
              <ShareCountOption
                label="From filings"
                value={shareCount.filed}
                active={shareCount.basis === "filings"}
                onSelect={() => onShareCountBasisChange?.("filings")}
              />
              <ShareCountOption
                label="Implied from market cap"
                value={shareCount.implied}
                active={shareCount.basis === "implied"}
                onSelect={() => onShareCountBasisChange?.("implied")}
              />
              {shareCount.basis === "manual" ? (
                <ShareCountOption
                  label="Entered by hand"
                  value={fields?.sharesOutstanding.value ?? null}
                  active
                  onSelect={undefined}
                />
              ) : null}
            </div>

            <div className="flex justify-between gap-4 font-mono text-[11px] tabular-nums">
              <span className="text-mist">Deviation</span>
              <span className="text-bearish">
                {formatPercent(Math.abs(capCheck.deviation), 1)}
              </span>
            </div>

            <p className="text-[10px] leading-relaxed text-mist/80">
              {shareCount.splitLike && shareCount.ratio
                ? `These differ by almost exactly ${shareCount.ratio.toFixed(2)}x, which is the signature of a stock split or an ADR ratio rather than a missing share class. When the ratio is a whole number the filing is usually the one to trust — check before accepting the default.`
                : "A multi-class company often reports only one class under this tag, so the implied count is used by default."}
            </p>
          </div>
        ) : null}
      </div>

      {scenarioTable ? (
        <div className="border-t border-wolf-border/25 pt-4">{scenarioTable}</div>
      ) : null}

      {balanceSheet ? (
        <div className="border-t border-wolf-border/25 pt-4">{balanceSheet}</div>
      ) : null}
    </div>
  );
}

function DiagnosticRow({
  tone,
  message,
}: {
  tone: "warning" | "muted";
  message: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg p-2.5 ring-1 ring-inset",
        tone === "warning"
          ? "bg-golden-hour/[0.08] ring-golden-hour/30"
          : "bg-snow-peak/[0.03] ring-wolf-border/40"
      )}
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          tone === "warning" ? "text-golden-hour" : "text-mist/60"
        )}
      />
      <p className="text-[11px] leading-relaxed text-mist/85">{message}</p>
    </div>
  );
}

function ShareCountOption({
  label,
  value,
  active,
  onSelect,
}: {
  label: string;
  value: number | null;
  active: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={value === null || !onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-lg px-2 py-1.5 text-left",
        "ring-1 ring-inset transition-[background-color,box-shadow,transform] duration-150 ease-out",
        active
          ? "bg-golden-hour/[0.12] ring-golden-hour/40"
          : "bg-snow-peak/[0.03] ring-wolf-border/40 hover:bg-snow-peak/[0.06]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] text-mist">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            active ? "bg-golden-hour" : "bg-wolf-border"
          )}
        />
        {label}
        {active ? (
          <span className="text-[9px] uppercase tracking-[0.08em] text-golden-hour">
            in use
          </span>
        ) : null}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-snow-peak">
        {value === null ? "—" : formatCompactNumber(value)}
      </span>
    </button>
  );
}
