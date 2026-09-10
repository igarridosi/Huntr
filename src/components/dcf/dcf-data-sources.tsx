"use client";

import { useState } from "react";
import { cn, formatCompactNumber, formatPercent } from "@/lib/utils";
import type {
  SourcedDCFFields,
  SourcedValue,
  ZeroSuspectField,
} from "@/lib/calculations/dcf-inputs-source";
import type { LeaseTreatment } from "@/lib/api/sec-edgar";
import { AlertTriangle, ChevronDown, FileText, Globe } from "lucide-react";

interface DCFDataSourcesProps {
  fields: SourcedDCFFields | null;
  includeLeases: boolean;
  onIncludeLeasesChange: (include: boolean) => void;
  /** Whether capitalising is available, and why not when it is not. */
  leaseTreatment: LeaseTreatment;
  deductSBC: boolean;
  onDeductSBCChange: (deduct: boolean) => void;
  /** Revenue, so the two FCF margins can be shown side by side. */
  baseRevenue: number;
  /**
   * Free cash flow *before* any stock-compensation deduction.
   *
   * Passed explicitly rather than derived from the live margin: the toggle
   * moves that margin, so deriving both lines from it showed the same number
   * twice and made the adjustment look like it did nothing.
   */
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
  includeLeases,
  onIncludeLeasesChange,
  leaseTreatment,
  deductSBC,
  onDeductSBCChange,
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

  const sbc = fields.shareBasedCompensation.value;
  const rawMargin = baseRevenue > 0 ? freeCashFlow / baseRevenue : 0;
  const adjustedMargin = baseRevenue > 0 ? (freeCashFlow - sbc) / baseRevenue : 0;
  // Nothing to offer when the charge could not be read. A toggle that changes
  // nothing is worse than no toggle: it implies an adjustment was applied.
  const canDeductSBC = sbc > 0;

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
                muted={!includeLeases}
              />
              <DebtLine label="− Cash &amp; equivalents" value={-netDebt.cash} />
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

              {/* Off by default. Under ASC 842 the rent is already out of
                  operating cash flow, so counting the liability as debt as
                  well discounts the same obligation twice - and doing only
                  that, without returning the rent, is the one combination
                  that is simply wrong. */}
              <Toggle
                checked={includeLeases}
                onChange={onIncludeLeasesChange}
                disabled={!leaseTreatment.canCapitalise}
                label="Capitalise operating leases"
                hint={
                  leaseTreatment.canCapitalise
                    ? "Operating leases are already deducted from operating cash flow. Counting them as debt too discounts them twice, so turning this on also returns the interest on the liability to free cash flow to compensate."
                    : (leaseTreatment.reason ?? "")
                }
              />
            </div>

            {/* ── Stock compensation ── */}
            <div className="space-y-1.5 border-t border-wolf-border/25 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">
                Free cash flow
              </p>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-mist">
                  Reported FCF margin
                </span>
                <span className="font-mono text-xs tabular-nums text-mist">
                  {formatPercent(rawMargin, 1)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-mist">
                  After stock compensation
                </span>
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    deductSBC ? "text-snow-peak" : "text-mist/50"
                  )}
                >
                  {formatPercent(adjustedMargin, 1)}
                </span>
              </div>
              <Toggle
                checked={deductSBC}
                disabled={!canDeductSBC}
                onChange={onDeductSBCChange}
                label={
                  canDeductSBC
                    ? `Deduct stock compensation (${formatCompactNumber(sbc)} a year)`
                    : "Deduct stock compensation"
                }
                hint={
                  canDeductSBC
                    ? "Operating cash flow adds share-based pay back because no cash left the building. None did, but ownership did — the shareholder pays for it in dilution."
                    : "The annual stock compensation charge is not in this filing, so there is nothing to deduct."
                }
              />
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

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "mt-2 flex items-start gap-2.5 rounded-lg bg-snow-peak/[0.03] p-2.5 ring-1 ring-inset ring-wolf-border/40",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      )}
    >
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-sunset-orange disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-snow-peak">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-mist/70">
          {hint}
        </span>
      </span>
    </label>
  );
}
