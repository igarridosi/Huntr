"use client";

import { AlertTriangle, FileSearch } from "lucide-react";
import { MaterialPanel } from "@/components/ui/material-panel";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { TickerPicker } from "./ticker-picker";
import { InsiderSummary } from "./insider-summary";
import { InsiderChart } from "./insider-chart";
import { InsiderLines } from "./insider-lines";
import { InsiderFeed } from "./insider-feed";
import { InsiderLoader, ReadingProgress } from "./insider-loader";
import { useBatchDailyHistory, useInsiderActivity, useStockProfile } from "@/hooks/use-stock-data";

interface InsidersPanelProps {
  ticker: string;
  onTicker: (ticker: string) => void;
}

/**
 * Two columns on a wide screen: two thirds for the picture (the twelve
 * months and the trades on the price), one third for the evidence (every
 * line, scrolling). One column on a narrow screen, picture first.
 */
export function InsidersPanel({ ticker, onTicker }: InsidersPanelProps) {
  const activity = useInsiderActivity(ticker, ticker.length > 0);
  const profile = useStockProfile(ticker);
  const history = useBatchDailyHistory(ticker ? [ticker] : [], "1Y", ticker.length > 0);
  const prices = history.data?.[ticker] ?? [];
  const a = activity.data;

  return (
    <div className="space-y-5">
      <TickerPicker key={ticker} value={ticker} onPick={onTicker} />

      {!ticker ? (
        <MaterialPanel>
          <h2 className="text-[0.95rem] font-semibold tracking-[-0.01em] text-snow-peak">Across your watchlist</h2>
          <p className="mt-1 text-xs text-mist">The latest open-market trades by officers and directors of the companies you follow.</p>
          <div className="mt-4">
            <InsiderFeed onOpen={onTicker} />
          </div>
        </MaterialPanel>
      ) : activity.isLoading ? (
        <InsiderLoader ticker={ticker} name={profile.data?.name} />
      ) : !a ? (
        <MaterialPanel className="flex flex-col items-center gap-2 py-12 text-center">
          <AlertTriangle className="h-5 w-5 text-golden-hour" aria-hidden />
          <p className="text-sm text-snow-peak">No SEC record for {ticker}</p>
          <p className="max-w-sm text-xs text-mist">
            Form 4s exist only for companies registered with the SEC. A foreign listing or a fund has none, and EDGAR can also be
            briefly out of reach.
          </p>
        </MaterialPanel>
      ) : a.rows.length === 0 ? (
        <MaterialPanel className="flex flex-col items-center gap-2 py-12 text-center">
          <FileSearch className="h-5 w-5 text-mist" aria-hidden />
          <p className="text-sm text-snow-peak">No Form 4s in the last two years</p>
          <p className="max-w-sm text-xs text-mist">{profile.data?.name ?? ticker} has no insider filings on EDGAR in that time.</p>
        </MaterialPanel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <MaterialPanel className="flex flex-col gap-5 lg:col-span-2">
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h2 className="flex items-center gap-3 text-lg font-semibold tracking-[-0.015em] text-snow-peak">
                <TickerLogo ticker={ticker} className="h-9 w-9 rounded-xl" />
                <span>
                  {profile.data?.name ?? ticker} <span className="font-mono text-sm font-medium text-sunset-orange">{ticker}</span>
                </span>
              </h2>
              <span className="font-mono text-[11px] tabular-nums text-mist">
                {a.summary.from} to {a.summary.to}
              </span>
            </header>

            {/* While steps are still landing, the bar says the totals are not
                final. Once complete, the cap notice says what they cover. */}
            {a.progress.read < a.progress.total ? (
              <ReadingProgress read={a.progress.read} total={a.progress.total} />
            ) : a.coverage.truncated && a.coverage.from && a.coverage.from > a.summary.from ? (
              <p className="flex items-start gap-2 rounded-xl bg-golden-hour/[0.07] px-3 py-2.5 text-xs text-golden-hour ring-1 ring-inset ring-golden-hour/25">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                Partial year. This company files so many Form 4s that the 60 read reach back only to {a.coverage.from}, so the totals
                cover {a.coverage.from} to {a.summary.to}.
              </p>
            ) : null}

            <InsiderSummary summary={a.summary} />
            <InsiderChart prices={prices} rows={a.rows} loading={history.isLoading} />
          </MaterialPanel>

          <MaterialPanel className="lg:col-span-1">
            <header className="mb-3">
              <h2 className="text-[0.95rem] font-semibold tracking-[-0.01em] text-snow-peak">Every line</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-mist">
                {a.coverage.filings} filing{a.coverage.filings === 1 ? "" : "s"} read, back to {a.coverage.from}.
                {a.coverage.truncated ? " The most recent 60 only." : ""} Tap a line for the filing and its footnotes.
              </p>
            </header>
            <InsiderLines rows={a.rows} cik={a.cik} />
          </MaterialPanel>
        </div>
      )}
    </div>
  );
}
