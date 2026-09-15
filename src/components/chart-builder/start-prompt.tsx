"use client";

import { ChartColumnStacked } from "lucide-react";
import { DCFTickerInput } from "@/components/dcf/dcf-ticker-input";
import { MAX_TICKERS } from "@/lib/chart-builder";

interface StartPromptProps {
  onPick: (ticker: string) => void;
}

/**
 * The first screen: one search box. No company is on the chart — and no
 * data source is called — until the user names one.
 */
export function StartPrompt({ onPick }: StartPromptProps) {
  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center sm:py-20">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sunset-orange/10 ring-1 ring-inset ring-sunset-orange/20">
        <ChartColumnStacked className="h-6 w-6 text-sunset-orange" aria-hidden />
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-snow-peak">Add a company to start</h2>
        <p className="mt-1 max-w-md text-sm text-mist">
          Search a ticker. Compare up to {MAX_TICKERS} companies, pick any metric, then shape and export the chart.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <DCFTickerInput value="" onSelect={onPick} />
      </div>
    </div>
  );
}
