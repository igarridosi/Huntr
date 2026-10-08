"use client";

import { useState } from "react";
import { cn, formatCompactNumber, formatPercent } from "@/lib/utils";
import type {
  SourcedDCFFields,
  SourcedValue,
  ZeroSuspectField,
} from "@/lib/calculations/dcf-inputs-source";
import { AlertTriangle, ChevronDown, FileText, Globe } from "lucide-react";

interface DCFDataSourcesProps {
  fields: SourcedDCFFields | null;
  /** The stock compensation the engine deducts, over the same period as the revenue base. */
  sbcAmount: number;
  /** "TTM" when the trailing twelve months were composed from the filings, "FY" for the last 10-K. */
  sbcPeriod: "TTM" | "FY";
  /** Revenue, so the two FCF margins can be shown side by side. */
  baseRevenue: number;
  /** Free cash flow *before* any stock-compensation deduction: the slider's margin times revenue. */
  freeCashFlow: number;
  /** Figures typed in by hand, keyed by field. */
  overrides: Partial<Record<ZeroSuspectField, number>>;
  onOverride: (field: ZeroSuspectField, value: number | null) => void;
  isLoading?: boolean;
}

/**
 * Where the balance-sheet half of the model came from, and what it is worth.
 *
 * The figures underneath a DCF are the part nobody checks, because they arrive
 * pre-filled and look like facts. Some of them are: a share count from a 10-Q
 * is a fact. Others are a scrape that can disagree with its own market cap by
 * a fifth. This panel is here so the difference is visible before the model
 * runs on top of it.
 */
export function DCFDataSources({
  fields,
  sbcAmount,
  sbcPeriod,
  baseRevenue,
  freeCashFlow,
  overrides,
  onOverride,
  isLoading = false,
}: DCFDataSourcesProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (!fields) return null;

  const { netDebt, marketCapCheck } = fields;
  const capMismatch = marketCapCheck !== null && !marketCapCheck.agrees;

  const sbc = Math.max(0, sbcAmount);
  const rawMargin = baseRevenue > 0 ? freeCashFlow / baseRevenue : 0;
  const sbcMargin = baseRevenue > 0 ? sbc / baseRevenue : 0;

  return (
    <div className="space-y-3">
      {/* ── Market cap cross-check ──
          The cheapest check in the model per line of code: price times shares
          has to land on the reported market cap. When it does not, the share
          count is from the wrong class of stock, the wrong quarter, or the
          wrong company - and every per-share figure below is wrong with it. */}
      {capMismatch && marketCapCheck ? (
        <div className="flex items-start gap-2 rounded-xl bg-golden-hour/[0.08] p-3 ring-1 ring-inset ring-golden-hour/30">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-golden-hour" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-golden-hour">
              Share count does not match the reported market cap
            </p>
            {/* Describes the *filed* count, which is the one that disagrees.
                Quoting the count in use would state a deviation the model is
                no longer exposed to, and print it next to a number that
                reconciles by construction. */}
            <p className="text-[11px] leading-relaxed text-mist/85">
              {formatCompactNumber(fields.shareCount.filed ?? 0)} filed shares at
              today&apos;s price implies{" "}
              {formatCompactNumber(marketCapCheck.implied)}, against a reported{" "}
              {formatCompactNumber(marketCapCheck.reported)} —{" "}
              {formatPercent(Math.abs(marketCapCheck.deviation), 1)} apart. The
              model is dividing by{" "}
              {fields.shareCount.basis === "implied"
                ? "the count implied by the market cap"
                : fields.shareCount.basis === "manual"
                  ? "the count you entered"
                  : "the filed count"}
              ; the valuation panel lets you switch.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Figures that could not be established ──
          Above the fold and above the collapsed panel, because until these are
          answered there is no valuation to look at. Each one offers the two
          ways out the situation actually has: supply the number, or state that
          the zero is real. Nothing else can distinguish them. */}
      {fields.unresolved.length > 0 ? (
        <div className="space-y-2.5 rounded-xl bg-bearish/[0.06] p-3 ring-1 ring-inset ring-bearish/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bearish" />
            <p className="text-[11px] leading-relaxed text-mist/85">
              <span className="font-medium text-bearish">
                Missing balance-sheet data.
              </span>{" "}
              These could not be found in the filings or the fallback. A blank
              read as zero would treat missing debt as net cash, so the
              valuation is held until each one is answered.
            </p>
          </div>
          {fields.unresolved.map((field) => (
            <UnresolvedField
              key={field}
              field={field}
              value={overrides[field]}
              onOverride={onOverride}
            />
          ))}
        </div>
      ) : null}

      <div className="rounded-xl bg-snow-peak/[0.025] ring-1 ring-inset ring-wolf-border/35">
        <button
          type="button"
          onClick={() => setShowBreakdown((previous) => !previous)}
          aria-expanded={showBreakdown}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left",
            "transition-[background-color,transform] duration-150 ease-out",
            "hover:bg-snow-peak/[0.04] active:scale-[0.99]",
            "motion-reduce:transition-none motion-reduce:active:scale-100"
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-xs font-medium text-snow-peak">
              Balance sheet &amp; sources
            </span>
            {isLoading ? (
              <span className="text-[10px] text-mist/60">checking filings…</span>
            ) : (
              <SourceChip usesSEC={fields.usesSEC} />
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-mist transition-transform duration-150 ease-out",
              showBreakdown && "rotate-180",
              "motion-reduce:transition-none"
            )}
          />
        </button>

        {showBreakdown ? (
          <div className="space-y-4 border-t border-wolf-border/25 px-3 py-3">
            {/* ── Net debt, itemised ── */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                Net debt
              </p>
              <DebtLine label="Financial debt" value={netDebt.financialDebt} />
              <DebtLine
                label="+ Lease liabilities"
                value={netDebt.operatingLeases}
                muted={!netDebt.includesLeases}
              />
              {netDebt.redeemablePreferred > 0 ? (
                <DebtLine
                  label="+ Redeemable preferred"
                  value={netDebt.redeemablePreferred}
                  muted={!netDebt.includesPreferred}
                />
              ) : null}
              <DebtLine label="− Cash &amp; short-term investments" value={-netDebt.cash} />
              <div className="flex items-baseline justify-between gap-3 border-t border-wolf-border/25 pt-1.5">
                <span className="text-xs font-medium text-snow-peak">
                  {netDebt.isNetCash ? "Net cash" : "Net debt"}
                </span>
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    netDebt.isNetCash ? "text-bullish" : "text-snow-peak"
                  )}
                >
                  {formatCompactNumber(netDebt.netDebt)}
                </span>
              </div>
              {netDebt.isNetCash ? (
                <p className="text-[10px] leading-relaxed text-mist/70">
                  More cash than debt, so this is negative and adds to enterprise
                  value rather than subtracting from it.
                </p>
              ) : null}

              {netDebt.operatingLeases > 0 ? (
                <p className="text-[10px] leading-relaxed text-mist/70">
                  Lease liabilities are shown, not subtracted: the rent is already
                  out of operating cash flow, so counting them as debt too would
                  discount the same obligation twice.
                </p>
              ) : null}
              {netDebt.redeemablePreferred > 0 ? (
                <p className="text-[10px] leading-relaxed text-mist/70">
                  {netDebt.includesPreferred
                    ? "Redeemable preferred is subtracted: the filing shows no conversion shares in the diluted count, so it is a claim ahead of the common shareholder."
                    : "Redeemable preferred is shown, not subtracted: the filing adds conversion shares to the diluted count, so it is already in the per-share figures."}
                </p>
              ) : null}
            </div>

            {/* ── Stock compensation ── */}
            <div className="space-y-1.5 border-t border-wolf-border/25 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                Free cash flow
              </p>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-mist">
                  Base margin, as reported
                </span>
                <span className="font-mono text-xs tabular-nums text-mist">
                  {formatPercent(rawMargin, 1)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-mist">
                  − Stock compensation{sbc > 0 ? ` (${formatCompactNumber(sbc)}, ${sbcPeriod})` : ""}
                </span>
                <span className="font-mono text-xs tabular-nums text-mist">
                  {sbc > 0 ? formatPercent(-sbcMargin, 1) : "—"}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-wolf-border/25 pt-1.5">
                <span className="text-[11px] font-medium text-snow-peak">
                  Before capital-structure adjustments
                </span>
                <span className="font-mono text-xs tabular-nums text-snow-peak">
                  {formatPercent(rawMargin - sbcMargin, 1)}
                </span>
              </div>
              <p className="text-[10px] leading-relaxed text-mist/70">
                {sbc > 0
                  ? "Enter margins as reported, the same basis as the record under the sliders. Stock compensation is always deducted, on both margins of all three scenarios: no cash left the building, but ownership did."
                  : "No stock compensation charge was found in the filings, so nothing is deducted."}
              </p>
            </div>

            {/* ── Provenance, field by field ── */}
            <div className="space-y-1.5 border-t border-wolf-border/25 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                Where each figure came from
              </p>
              <SourceLine label="Diluted shares" field={fields.sharesOutstanding} />
              <SourceLine label="Financial debt" field={fields.financialDebt} />
              <SourceLine label="Cash" field={fields.cash} />
              <SourceLine label="Lease liabilities" field={fields.operatingLeases} />
              <SourceLine label="Stock compensation" field={fields.shareBasedCompensation} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const UNRESOLVED_LABELS: Record<ZeroSuspectField, string> = {
  financialDebt: "Financial debt",
  cash: "Cash & equivalents",
  sharesOutstanding: "Shares outstanding",
};

function UnresolvedField({
  field,
  value,
  onOverride,
}: {
  field: ZeroSuspectField;
  value: number | undefined;
  onOverride: (field: ZeroSuspectField, value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onOverride(field, null);
      return;
    }
    const parsed = Number(trimmed.replace(/[,\s]/g, ""));
    if (Number.isFinite(parsed)) onOverride(field, parsed);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-snow-peak/[0.03] p-2 ring-1 ring-inset ring-wolf-border/40">
      <span className="min-w-[7.5rem] flex-1 text-[11px] text-snow-peak">
        {UNRESOLVED_LABELS[field]}
      </span>
      {/* An em dash, not a zero. The whole bug is that those two looked the
          same once the number reached the model. */}
      <span className="font-mono text-xs text-mist/60">
        {value === undefined ? "—" : formatCompactNumber(value)}
      </span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="Enter value"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className="h-7 w-28 rounded-md bg-wolf-black/60 px-2 font-mono text-[11px] tabular-nums text-snow-peak ring-1 ring-inset ring-wolf-border/50 placeholder:text-mist/50 focus:outline-none focus:ring-sunset-orange/55"
      />
      <button
        type="button"
        onClick={() => {
          setDraft("0");
          onOverride(field, 0);
        }}
        className={cn(
          "rounded-md px-2 py-1 text-[10px] font-medium ring-1 ring-inset",
          "bg-snow-peak/[0.05] text-mist ring-wolf-border/45",
          "transition-[background-color,color,transform] duration-150 ease-out",
          "hover:bg-snow-peak/[0.08] hover:text-snow-peak active:scale-[0.97]",
          "motion-reduce:transition-none motion-reduce:active:scale-100"
        )}
      >
        It really is zero
      </button>
    </div>
  );
}

function SourceChip({ usesSEC }: { usesSEC: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ring-1 ring-inset",
        usesSEC
          ? "bg-bullish/[0.10] text-bullish ring-bullish/25"
          : "bg-snow-peak/[0.05] text-mist ring-wolf-border/40"
      )}
    >
      {usesSEC ? <FileText className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
      {usesSEC ? "SEC filings" : "Yahoo"}
    </span>
  );
}

function DebtLine({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", muted && "opacity-40")}>
      <span className="text-[11px] text-mist">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-mist">
        {formatCompactNumber(value)}
      </span>
    </div>
  );
}

function SourceLine({ label, field }: { label: string; field: SourcedValue }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-mist">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {field.asOf ? (
          <span
            className={cn(
              "font-mono text-[10px] tabular-nums",
              // Past a reporting quarter the figure is either an annual number
              // standing in for a current one, or a company that has gone quiet.
              field.stale ? "text-golden-hour" : "text-mist/60"
            )}
          >
            {field.asOf}
          </span>
        ) : null}
        <SourceChip usesSEC={field.source === "sec"} />
        </span>
      </div>
      {/* A figure that is right for its concept but wrong for the use it is
          being put to. Saying which is the difference between a number and a
          number you can act on. */}
      {field.caveat ? (
        <p className="text-[10px] leading-relaxed text-golden-hour/80">
          {field.caveat}
        </p>
      ) : null}
    </div>
  );
}
