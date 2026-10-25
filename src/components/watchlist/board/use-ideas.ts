"use client";

import { useMemo, useState } from "react";
import type { HuntingGroundMetrics } from "@/lib/api/cache";
import type { SavedDCFScenario } from "@/hooks/use-dcf-scenarios";
import type { InsiderSignal } from "@/lib/insiders/signal";
import { isUnmeasured } from "@/lib/hunting-ground";
import { toGicsSector } from "@/lib/screener/sectors";
import {
  fairValueOf,
  gapOf,
  nextEvent,
  stanceOf,
  type FairValue,
  type IdeaRank,
  type Stance,
} from "@/lib/watchlist/ideas";
import type { StockProfile, StockQuote } from "@/types/stock";
import type { PriceAlert, WatchlistEntry, WatchlistTickerItem } from "@/types/watchlist";

/** One company on the list, with everything a row and its panel show. */
export interface Idea extends IdeaRank {
  name: string;
  logo?: string;
  sector: string | null;
  price: number | null;
  fair: FairValue | null;
  stance: Stance;
  /** Quality, its four parts and the free-cash-flow yield; null until loaded. */
  metrics: HuntingGroundMetrics | null;
  /** A bank, insurer or landlord: free cash flow does not measure it. */
  unmeasured: boolean;
  signal: InsiderSignal | null;
  alerts: PriceAlert[];
  /** An active alert the price has crossed. */
  alertHit: boolean;
  notes: string;
  target: number | null;
  quote: StockQuote | null;
  profile: StockProfile | null;
  /** The quote has not arrived yet. */
  pending: boolean;
}

/**
 * The active list as ideas. The rows come from the list itself, so they are
 * on screen at once; quotes, scores, saved valuations and insider records
 * fill each one in as they arrive.
 */
export function useIdeas({
  items,
  entries,
  saved,
  metrics,
  signals,
  alerts,
}: {
  items: readonly WatchlistTickerItem[];
  entries: readonly WatchlistEntry[] | undefined;
  saved: readonly SavedDCFScenario[];
  metrics: Record<string, HuntingGroundMetrics> | undefined;
  signals: Record<string, InsiderSignal> | undefined;
  alerts: readonly PriceAlert[];
}): Idea[] {
  // The day the page opened: events count from it.
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    const byTicker = new Map((entries ?? []).map((e) => [e.ticker, e]));
    const valuations = new Map(saved.map((s) => [s.ticker.toUpperCase(), s]));
    return items.map((item) => {
      const ticker = item.ticker.toUpperCase();
      const entry = byTicker.get(item.ticker) ?? byTicker.get(ticker);
      const quote = entry?.quote ?? null;
      const profile = entry?.profile ?? null;
      const price = quote?.price && quote.price > 0 ? quote.price : null;
      const fair = fairValueOf(valuations.get(ticker), item.target_price, price);
      const gap = gapOf(price, fair);
      const m = metrics?.[ticker] ?? null;
      const tickerAlerts = alerts.filter((a) => a.ticker.toUpperCase() === ticker);
      const alertHit =
        price != null &&
        tickerAlerts.some((a) => a.active && (a.type === "below" ? price <= a.price : price >= a.price));
      return {
        ticker,
        name: profile?.name ?? ticker,
        logo: profile?.logo_url || undefined,
        sector: toGicsSector(profile?.sector ?? m?.sector),
        price,
        change: quote?.day_change_percent ?? null,
        fair,
        gap,
        stance: stanceOf(gap),
        event: quote ? nextEvent(quote.next_earnings_date, quote.ex_dividend_date, now) : null,
        quality: m?.quality ?? null,
        metrics: m,
        unmeasured: isUnmeasured(profile?.sector ?? m?.sector ?? null, profile?.industry ?? m?.industry),
        signal: signals?.[ticker] ?? null,
        alerts: tickerAlerts,
        alertHit,
        notes: item.notes,
        target: item.target_price,
        quote,
        profile,
        pending: !entry,
      };
    });
  }, [items, entries, saved, metrics, signals, alerts, now]);
}
