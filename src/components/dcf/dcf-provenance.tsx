"use client";

import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn, formatCompactNumber, formatPercent } from "@/lib/utils";
import type { FieldProvenance } from "@/lib/dcf/provenance";
import type { ValuationGate } from "@/lib/dcf/gate";
import type { CashFlowBasis, InterestAddBack } from "@/lib/dcf/cash-flow-basis";

const FIELD_LABEL: Record<FieldProvenance["field"], string> = {
  baseRevenue: "Revenue base",
  fcfMargin: "FCF margin",
  netDebt: "Net debt",
  sharesOutstanding: "Shares",
  currentPrice: "Price",
};

const fmt = (p: FieldProvenance) =>
  p.field === "fcfMargin" ? formatPercent(p.value, 1) : p.field === "currentPrice" ? `$${p.value.toFixed(2)}` : p.field === "sharesOutstanding" ? formatCompactNumber(p.value) : `$${formatCompactNumber(p.value)}`;

interface DCFProvenanceProps {
  provenance: FieldProvenance[];
  gate: ValuationGate;
  basis: CashFlowBasis;
  addBack: InterestAddBack | null;
  onBasisChange: (basis: CashFlowBasis) => void;
}

/**
 * The five inputs, each with where it came from, and the five checks run
 * on them before the value was shown.
 *
 * A figure that ties to a filing shows the form and the accession
 * number; one that does not is marked unverified with the reason. Read
 * this before the number in the middle column, because it is the part
 * that has been wrong.
 */
export function DCFProvenance({ provenance, gate, basis, addBack, onBasisChange }: DCFProvenanceProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">Inputs and where they come from</p>
        <ul className="space-y-1.5">
          {provenance.map((p) => (
            <li key={p.field} className="rounded-lg bg-snow-peak/[0.025] px-2.5 py-2 ring-1 ring-inset ring-wolf-border/30">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-snow-peak">{FIELD_LABEL[p.field]}</span>
                <span className="font-mono text-[11px] font-semibold tabular-nums text-snow-peak">{fmt(p)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-mist/75">
                <span className={cn("inline-flex items-center gap-1 font-medium", p.verified ? "text-bullish" : "text-golden-hour")}>
                  {p.verified ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <CircleDashed className="h-3 w-3" aria-hidden />}
                  {p.verified ? "verified" : "unverified"}
                </span>
                <span>· {p.source}</span>
                {p.document ? (
                  <span className="font-mono">
                    · {p.document.form}
                    {p.document.accession ? ` ${p.document.accession}` : ""}
                  </span>
                ) : null}
                {p.periodEnd ? <span>· {p.periodStart ? `${p.periodStart} → ` : "to "}{p.periodEnd}</span> : null}
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-mist/60">{p.note}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">Checks run before the value</p>
        <ul className="space-y-1">
          {gate.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-[10px] leading-snug">
              {c.status === "pass" ? (
                <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-bullish" aria-hidden />
              ) : c.status === "fail" ? (
                <XCircle className="mt-px h-3 w-3 shrink-0 text-bearish" aria-hidden />
              ) : (
                <CircleDashed className="mt-px h-3 w-3 shrink-0 text-mist/60" aria-hidden />
              )}
              <span className="text-mist/80">
                <span className={cn("font-medium", c.status === "fail" ? "text-bearish" : "text-snow-peak")}>{c.label}</span>
                {c.status === "unverifiable" ? <span className="text-mist/60"> (not verifiable)</span> : null} — {c.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-mist/60">Cash flow basis</p>
        </div>
        <SegmentedTabs<CashFlowBasis>
          size="sm"
          className="grid w-full grid-cols-2"
          ariaLabel="Cash flow basis"
          value={basis}
          onChange={onBasisChange}
          items={[
            { key: "unlevered", label: "Unlevered" },
            { key: "levered", label: "Levered" },
          ]}
        />
        <p className="text-[10px] leading-relaxed text-mist/70">
          {basis === "unlevered" ? (
            <>
              After-tax interest added back
              {addBack ? ` (${formatPercent(addBack.marginPoints, 2)} of revenue: $${formatCompactNumber(addBack.interestExpense)} at a ${formatPercent(addBack.taxRate, 0)} ${addBack.taxRateSource} tax rate)` : ""}; net debt subtracted from the discounted flows. The pairing the two-stage model is built for.
            </>
          ) : (
            <>Flows as reported, after interest, and net debt <span className="text-mist">not</span> subtracted — the model runs with debt and cash at zero. Discounted at the same rate; a simplification, stated.</>
          )}
        </p>
      </div>
    </div>
  );
}
