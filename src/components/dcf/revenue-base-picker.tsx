"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn, formatCompactNumber } from "@/lib/utils";
import type { RevenueBaseDivergence, RevenueBases, RevenueBasis } from "@/lib/dcf/revenue-base";

interface RevenueBasePickerProps {
  bases: RevenueBases;
  basis: RevenueBasis;
  /** The figure in use, whichever basis produced it. */
  value: number;
  divergence: RevenueBaseDivergence | null;
  onChange: (basis: RevenueBasis) => void;
  /** A figure typed in under "Manual", in dollars. */
  onManualChange: (value: number) => void;
  /** After a divergence: whether the reader confirmed the base in use describes today's perimeter. */
  perimeterConfirmed?: boolean;
  onConfirmPerimeter?: () => void;
}

/** "3.05B", "3047M", "3047000000" → dollars; null when it is not a number. */
export function parseRevenueEntry(text: string): number | null {
  const m = /^\s*\$?\s*([\d.,]+)\s*([kmbt])?\s*$/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const scale = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] ?? "").toLowerCase()] ?? 1;
  return n * scale;
}

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * What every projected flow starts from, said out loud.
 *
 * The base revenue used to be whatever the generator picked — the last
 * closed fiscal year — and nothing on screen said so. For a company that
 * has reported two or three quarters since, or bought a business
 * mid-year, that is a different company. The picker names the basis in
 * use, the periods it sums and the close it runs to, so the choice is
 * visible at a glance and deliberate when changed.
 */
export function RevenueBasePicker({ bases, basis, value, divergence, onChange, onManualChange, perimeterConfirmed = false, onConfirmPerimeter }: RevenueBasePickerProps) {
  const option = basis === "ttm" ? bases.ttm : basis === "fiscal_year" ? bases.fiscalYear : null;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = parseRevenueEntry(draft);
    setDraft(null);
    if (parsed !== null) onManualChange(parsed);
  };
  const items = [
    { key: "ttm" as const, label: "TTM" },
    { key: "fiscal_year" as const, label: "Fiscal year" },
    { key: "manual" as const, label: "Manual" },
  ].filter((i) => (i.key === "ttm" ? bases.ttm !== null : i.key === "fiscal_year" ? bases.fiscalYear !== null : true));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.09em] text-snow-peak">Revenue base</h3>
        <span className="font-mono text-xs font-semibold tabular-nums text-snow-peak">${formatCompactNumber(value)}</span>
      </div>
      <SegmentedTabs<RevenueBasis>
        size="sm"
        className="grid w-full grid-cols-3"
        ariaLabel="Revenue base"
        value={basis}
        onChange={onChange}
        items={items}
      />
      <p className="text-[10px] leading-relaxed text-mist/70">
        {option ? (
          <>
            {basis === "ttm" ? "Trailing twelve months" : "Last closed fiscal year"}: {option.periods}, {fmtDate(option.periodStart)} to{" "}
            <span className="text-mist">{fmtDate(option.periodEnd)}</span>.
            {basis === "fiscal_year" && bases.ttm ? " Quarters have been reported since." : ""}
          </>
        ) : basis === "manual" ? (
          <span className="flex items-center gap-2">
            <span>Entered by hand, in dollars (3.05B, 3047M):</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Revenue base, entered by hand"
              value={draft ?? formatCompactNumber(value)}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setDraft(String(value))}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setDraft(null);
                  e.currentTarget.blur();
                }
              }}
              className="w-[6.5rem] rounded-md bg-wolf-black/60 px-1.5 py-0.5 text-right font-mono text-[11px] font-semibold tabular-nums text-snow-peak ring-1 ring-inset ring-wolf-border/40 focus:outline-none focus:ring-sunset-orange/55"
            />
          </span>
        ) : (
          "No revenue on file for this basis."
        )}
      </p>
      {divergence ? (
        <div className={cn("flex items-start gap-2 rounded-lg p-2.5 ring-1 ring-inset", "bg-golden-hour/[0.08] ring-golden-hour/30")}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-golden-hour" aria-hidden />
          <div className="space-y-1.5">
            <p className="text-[10px] leading-relaxed text-mist/85">{divergence.message}</p>
            {onConfirmPerimeter ? (
              perimeterConfirmed ? (
                <p className="text-[10px] font-medium text-bullish">Confirmed: the base in use describes today&apos;s perimeter.</p>
              ) : (
                <button
                  type="button"
                  onClick={onConfirmPerimeter}
                  className="rounded-md bg-snow-peak/[0.06] px-2 py-1 text-[10px] font-medium text-snow-peak ring-1 ring-inset ring-wolf-border/50 transition-colors hover:bg-snow-peak/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60"
                >
                  I checked: this base describes today&apos;s perimeter
                </button>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
