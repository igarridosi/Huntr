"use client";

import { AlertTriangle, FileSearch, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TickerPicker } from "./ticker-picker";
import { InsiderSummary } from "./insider-summary";
import { InsiderChart } from "./insider-chart";
import { InsiderTable } from "./insider-table";
import { InsiderFeed } from "./insider-feed";
import { useBatchDailyHistory, useInsiderActivity, useStockProfile } from "@/hooks/use-stock-data";

interface InsidersPanelProps {
  ticker: string;
  onTicker: (ticker: string) => void;
}

/**
 * One company's Form 4s: twelve months summarised, the trades on the price,
 * and every line with the filing behind it. With no company chosen, the
 * watchlist feed stands in.
 */
export function InsidersPanel({ ticker, onTicker }: InsidersPanelProps) {
  const activity = useInsiderActivity(ticker, ticker.length > 0);
  const profile = useStockProfile(ticker);
  const history = useBatchDailyHistory(ticker ? [ticker] : [], "1Y", ticker.length > 0);
  const prices = history.data?.[ticker] ?? [];
  const a = activity.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TickerPicker key={ticker} value={ticker} onPick={onTicker} />
        <p className="text-[11px] leading-relaxed text-mist sm:max-w-md sm:text-right">
          From each company&apos;s Form 4 filings on SEC EDGAR. Only open-market trades outside a Rule 10b5-1 plan count as an
          insider buying or selling.
        </p>
      </div>

      {!ticker ? (
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">Across your watchlist</CardTitle>
            <p className="text-xs text-mist">The latest open-market trades by officers and directors of the companies you follow.</p>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <InsiderFeed onOpen={onTicker} />
          </CardContent>
        </Card>
      ) : activity.isLoading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-sunset-orange" />
            <p className="text-sm text-snow-peak">Reading {ticker}&apos;s Form 4s from EDGAR</p>
            <p className="max-w-sm text-xs text-mist">
              The first read of a company fetches every filing of the last two years at the pace the SEC allows — up to a
              few seconds. After that it is on file.
            </p>
          </CardContent>
        </Card>
      ) : !a ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <AlertTriangle className="h-5 w-5 text-golden-hour" />
            <p className="text-sm text-snow-peak">No SEC record for {ticker}</p>
            <p className="max-w-sm text-xs text-mist">
              Form 4s exist only for companies registered with the SEC. A foreign listing or a fund has none, and EDGAR may
              also be briefly unreachable.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="p-5 pb-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <CardTitle className="text-base">
                  {profile.data?.name ?? ticker} <span className="font-mono text-sm text-sunset-orange">{ticker}</span>
                </CardTitle>
                <span className="font-mono text-[11px] text-mist">
                  {a.summary.from} → {a.summary.to}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-5 pt-0">
              {a.rows.length === 0 ? (
                <p className="flex items-center gap-2 text-xs text-mist">
                  <FileSearch className="h-4 w-4" /> No Form 4s filed in the last two years.
                </p>
              ) : (
                <>
                  {/* The filing cap cut inside the window: the totals are
                      real but partial, and the reader has to know which part. */}
                  {a.coverage.truncated && a.coverage.from && a.coverage.from > a.summary.from ? (
                    <p className="flex items-start gap-2 rounded-lg bg-golden-hour/[0.07] px-3 py-2 text-xs text-golden-hour ring-1 ring-inset ring-golden-hour/25">
                      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                      Partial year: this company files so many Form 4s that the 60 read reach back only to {a.coverage.from}. The
                      totals cover {a.coverage.from} → {a.summary.to}, not the full twelve months.
                    </p>
                  ) : null}
                  <InsiderSummary summary={a.summary} />
                  <InsiderChart prices={prices} rows={a.rows} loading={history.isLoading} />
                </>
              )}
            </CardContent>
          </Card>

          {a.rows.length > 0 ? (
            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base">Every line</CardTitle>
                <p className="text-xs text-mist">
                  {a.coverage.filings} filing{a.coverage.filings === 1 ? "" : "s"} read, back to {a.coverage.from}.
                  {a.coverage.truncated ? " The most recent 60 only — this company files more than that in two years." : ""} Tap a
                  line for its footnotes.
                </p>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <InsiderTable rows={a.rows} cik={a.cik} />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
