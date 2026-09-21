"use client";

import { ShieldAlert } from "lucide-react";
import type { ValuationGate } from "@/lib/dcf/gate";

interface ValuationCoverProps {
  gate: ValuationGate;
  onUncover: () => void;
}

/**
 * What stands in front of the intrinsic value while a check has failed.
 *
 * Not a banner beside the number: the number is not shown. The reasons
 * are the failed checks, verbatim, and one click that says "I have read
 * them" uncovers it for this ticker — the export records that it was
 * uncovered by the reader.
 */
export function ValuationCover({ gate, onUncover }: ValuationCoverProps) {
  return (
    <div className="space-y-3 rounded-xl bg-bearish/[0.06] p-4 ring-1 ring-inset ring-bearish/35" role="alert">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-bearish" aria-hidden />
        <div className="space-y-1">
          <p className="text-[13px] font-semibold text-bearish">Intrinsic value withheld</p>
          <p className="text-[11px] leading-relaxed text-mist/85">
            {gate.reasons.length === 1 ? "One check on the inputs failed." : `${gate.reasons.length} checks on the inputs failed.`} The value would be arithmetic on a figure the checks could not stand behind.
          </p>
        </div>
      </div>
      <ul className="space-y-1.5 pl-6">
        {gate.reasons.map((r) => (
          <li key={r} className="text-[11px] leading-snug text-mist/85">
            {r}
          </li>
        ))}
      </ul>
      <div className="pl-6">
        <button
          type="button"
          onClick={onUncover}
          className="rounded-md bg-snow-peak/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-snow-peak ring-1 ring-inset ring-wolf-border/50 transition-colors hover:bg-snow-peak/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60"
        >
          I have read these — show the value
        </button>
      </div>
    </div>
  );
}
