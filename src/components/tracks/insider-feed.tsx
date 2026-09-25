"use client";

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchInsiderActivity } from "@/app/actions/stock";
import { useInsiderFeed } from "@/hooks/use-stock-data";
import { useWatchlist } from "@/hooks/use-watchlist";
import { labelOf, type InsiderRow } from "@/lib/insiders/activity";
import { QUERY_KEYS } from "@/lib/constants";
import { EDGE_FADE, useRowWindow, VISIBLE_ROWS } from "./use-row-window";
import { cn, formatCompactNumber, formatCurrency } from "@/lib/utils";

/**
 * Open-market trades across the watchlist, newest first.
 *
 * It reads the cache only: a company never opened costs a burst of SEC
 * requests, so those are listed by name and loaded on request, one after
 * another, with the count on the button — never all at once behind a
 * spinner.
 */
export function InsiderFeed({ onOpen }: { onOpen: (ticker: string) => void }) {
  // The lists are there before the watchlist's quotes are: waiting on the
  // hook's combined loading flag held the feed back for no reason, and a
  // disabled query reads exactly like an empty one.
  const { lists } = useWatchlist();
  const tickers = useMemo(() => [...new Set(lists.flatMap((l) => l.items.map((i) => i.ticker.toUpperCase())))].slice(0, 60), [lists]);
  const feed = useInsiderFeed(tickers, tickers.length > 0);
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState<{ done: number; total: number; stopping: boolean } | null>(null);
  const cancelled = useRef(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  const trades = useMemo(() => {
    const out: Array<InsiderRow & { ticker: string }> = [];
    for (const a of feed.data?.activities ?? []) {
      for (const r of a.rows) if (r.kind === "buy" || r.kind === "sell") out.push({ ...r, ticker: a.ticker });
    }
    return out.sort((x, y) => y.date.localeCompare(x.date)).slice(0, 40);
  }, [feed.data]);

  useRowWindow(scroller, [trades]);

  const clusters = (feed.data?.activities ?? []).filter((a) => a.summary.cluster);
  const missing = feed.data?.missing ?? [];

  const loadMissing = async () => {
    cancelled.current = false;
    const queue = [...missing];
    setLoading({ done: 0, total: queue.length, stopping: false });
    for (let i = 0; i < queue.length; i++) {
      if (cancelled.current) break;
      const t = queue[i];
      // Step through the company's filings until its record is complete,
      // or a step reads nothing new.
      let read = -1;
      for (;;) {
        const next = await fetchInsiderActivity(t).catch(() => null);
        if (!next) break;
        queryClient.setQueryData(QUERY_KEYS.INSIDERS(t), next);
        if (next.progress.read >= next.progress.total || next.progress.read <= read) break;
        read = next.progress.read;
      }
      // The feed grows company by company rather than all at the end: the
      // re-read is cache-only, so it costs no SEC request.
      await feed.refetch();
      setLoading((l) => (l ? { ...l, done: i + 1 } : l));
    }
    setLoading(null);
  };

  /* A company already being read cannot be cut off halfway — its filings
     are in flight — so stop means "after this one", and says so. */
  const stop = () => {
    cancelled.current = true;
    setLoading((l) => (l ? { ...l, stopping: true } : l));
  };

  if (tickers.length === 0) {
    return <p className="text-xs text-mist">Add companies to a watchlist and their insider trades collect here.</p>;
  }

  return (
    <div className="space-y-4">
      {clusters.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {clusters.map((a) => (
            <button
              key={a.ticker}
              type="button"
              onClick={() => onOpen(a.ticker)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-bullish/10 px-2.5 py-1.5 text-xs font-medium text-bullish ring-1 ring-inset ring-bullish/25 transition-transform active:scale-[0.97] motion-reduce:active:scale-100"
            >
              <Users className="h-3.5 w-3.5" aria-hidden />
              {a.ticker}: {a.summary.cluster!.insiders.length} insiders buying
            </button>
          ))}
        </div>
      ) : null}

      {feed.isPending ? (
        <p className="flex items-center gap-2 text-xs text-mist"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading what is on file…</p>
      ) : feed.isError ? (
        <p className="text-xs text-golden-hour">Could not read the insider record just now. Try again in a moment.</p>
      ) : trades.length === 0 ? (
        <p className="text-xs text-mist">No open-market trades on file for the companies loaded so far.</p>
      ) : (
        <div ref={scroller} className="overflow-y-auto overscroll-contain" style={trades.length > VISIBLE_ROWS ? EDGE_FADE : undefined}>
        <ul className={cn("flex flex-col gap-1", trades.length > VISIBLE_ROWS && "pb-9")}>
          {trades.map((r, i) => (
            <li key={`${r.accession}-${i}`}>
              <button
                type="button"
                onClick={() => onOpen(r.ticker)}
                className="grid w-full grid-cols-[5.5rem_3.5rem_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-[background-color,transform] duration-150 hover:bg-snow-peak/[0.04] active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange"
              >
                <span className="font-mono tabular-nums text-mist">{r.date}</span>
                <span className="font-mono font-semibold text-sunset-orange">{r.ticker}</span>
                <span className="min-w-0">
                  <span className="block truncate text-snow-peak">{r.owner}</span>
                  <span className="block truncate text-[11px] text-mist">
                    {labelOf(r.kind)}{r.plan ? " · 10b5-1 plan" : ""}
                  </span>
                </span>
                <span className={cn("text-right font-mono tabular-nums", r.kind === "buy" ? "text-bullish" : "text-bearish")}>
                  {r.kind === "buy" ? "+" : "−"}{formatCompactNumber(r.shares)}
                  <span className="block text-[11px] text-mist">{r.value !== null ? formatCurrency(r.value, { compact: true, decimals: 1 }) : "no price"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        </div>
      )}

      {missing.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-wolf-black/25 px-4 py-3 ring-1 ring-inset ring-wolf-border/40">
          <p className="text-xs text-mist">
            {missing.length} watchlist compan{missing.length === 1 ? "y" : "ies"} not read yet:{" "}
            <span className="font-mono text-snow-peak/80">{missing.slice(0, 8).join(", ")}{missing.length > 8 ? "…" : ""}</span>
          </p>
          {loading ? (
            <Button variant="outline" size="sm" onClick={stop} disabled={loading.stopping} className="gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {loading.stopping ? "Stopping after this one…" : `${loading.done}/${loading.total} · stop`}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={loadMissing}>Read them from EDGAR</Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
