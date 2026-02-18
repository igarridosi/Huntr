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

export default function TickerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase();

  const { data: profile, isLoading: profileLoading } = useStockProfile(ticker);
  const { data: quote, isLoading: quoteLoading } = useStockQuote(ticker);
  const { data: marketIndices } = useMarketIndices();

  useEffect(() => {
    if (!ticker) return;
    addRecentSearch(ticker);
  }, [ticker]);

  return (
    <div className="space-y-6 w-full">
      {/* Stock Header: name, price, quick stats, watchlist */}
      <StockHeader
        profile={profile}
        quote={quote}
        marketIndices={marketIndices}
        isLoading={profileLoading || quoteLoading}
      />

      {/* Tab Navigation */}
      <StockTabs ticker={ticker} />

      {/* Tab Content */}
      <div className="pt-2">{children}</div>
    </div>
  );
}
