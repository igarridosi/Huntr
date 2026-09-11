"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import {
  useStockProfile,
  useStockQuote,
  useMarketIndices,
} from "@/hooks/use-stock-data";
import { StockHeader } from "@/components/stock/stock-header";
import { StockTabs } from "@/components/stock/stock-tabs";
import { addRecentSearch } from "@/lib/recent-searches";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { StockProfile, StockQuote } from "@/types/stock";

export default function TickerClientLayout({
  children,
  initialProfile,
  initialQuote,
}: {
  children: React.ReactNode;
  initialProfile: StockProfile | null;
  initialQuote: StockQuote | null;
}) {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  // A null from the server means the lookup failed there; leave the cache
  // empty so the client tries once itself rather than treating it as final.
  const { data: profile, isLoading: profileLoading } = useStockProfile(ticker, {
    initialData: initialProfile ?? undefined,
  });
  const { data: quote, isLoading: quoteLoading } = useStockQuote(ticker, {
    initialData: initialQuote ?? undefined,
  });
  const { data: marketIndices, isLoading: marketIndicesLoading } = useMarketIndices();

  useEffect(() => {
    if (!ticker) return;
    addRecentSearch(ticker);
  }, [ticker]);

  useEffect(() => {
    if (!ticker || !quote) return;

    const companyName = profile?.name ?? `${ticker} Corp`;
    const dayChangePercent = quote.day_change_percent ?? 0;
    const sign = dayChangePercent >= 0 ? "+" : "";

    document.title = `${companyName} (${ticker}) | ${formatCurrency(quote.price)} (${sign}${formatPercent(dayChangePercent, 2)}) | Huntr`;
  }, [profile?.name, quote, ticker]);

  return (
    <div className="space-y-6 w-full">
      {/* Stock Header: name, price, quick stats, watchlist */}
      <StockHeader
        profile={profile}
        quote={quote}
        marketIndices={marketIndices}
        marketIndicesLoading={marketIndicesLoading}
        isLoading={profileLoading || quoteLoading}
      />

      {/* Tab Navigation */}
      <StockTabs ticker={ticker} />

      {/* Tab Content */}
      <div className="pt-2">{children}</div>
    </div>
  );
}
