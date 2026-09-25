"use client";

import { MaterialPanel } from "@/components/ui/material-panel";
import { TickerLogo } from "@/components/ui/ticker-logo";

/**
 * Before the first step lands: the company, and one line saying what is
 * happening. The total is not known yet, so the bar sweeps rather than
 * pretending to a percentage; under reduced motion it holds still.
 */
export function InsiderLoader({ ticker, name }: { ticker: string; name?: string }) {
  return (
    <MaterialPanel className="px-6 py-8" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-4">
        <TickerLogo ticker={ticker} className="h-11 w-11 rounded-xl" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-[-0.01em] text-snow-peak">
            {/* Until the profile arrives the symbol stands alone, rather than twice. */}
            {name ? <>{name} </> : null}
            <span className={name ? "font-mono text-sm font-medium text-sunset-orange" : "font-mono text-sunset-orange"}>{ticker}</span>
          </p>
          <p className="mt-0.5 text-xs text-mist">Reading the most recent Form 4 filings from SEC EDGAR</p>
        </div>
      </div>

      <div className="mt-6 h-[3px] w-full overflow-hidden rounded-full bg-wolf-border/50">
        <div className="h-full w-1/3 rounded-full bg-sunset-orange/80 animate-huntr-sweep motion-reduce:w-full motion-reduce:animate-none motion-reduce:bg-sunset-orange/30" />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-mist/70">
        The first look at a company takes a moment. The rest of its filings keep loading after the first ones appear, and
        everything read stays on file.
      </p>
    </MaterialPanel>
  );
}

/**
 * Once the first filings are on screen and more are on their way: a slim,
 * determinate bar. The figures above it are real but not final, and it
 * says so.
 */
export function ReadingProgress({ read, total }: { read: number; total: number }) {
  const share = total > 0 ? Math.min(1, read / total) : 0;
  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-mist">
        <span>Reading filings, totals update as they land</span>
        <span>
          {read} of {total}
        </span>
      </div>
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-wolf-border/50">
        <div
          className="h-full origin-left rounded-full bg-sunset-orange/80 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{ transform: `scaleX(${share})` }}
        />
      </div>
    </div>
  );
}
