"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  useStockProfile,
  useStockQuote,
  useMarketIndices,
} from "@/hooks/use-stock-data";
import { StockHeader } from "@/components/stock/stock-header";
import { StockTabs } from "@/components/stock/stock-tabs";
import { addRecentSearch } from "@/lib/recent-searches";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
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

  // The tab bar shows the company in brief once the full header has
  // scrolled up under the topbar (56px) and the bar itself.
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerGone, setHeaderGone] = useState(false);
  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const io = new IntersectionObserver(([entry]) => setHeaderGone(!entry.isIntersecting), {
      rootMargin: "-128px 0px 0px 0px",
    });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const dayChangePercent = quote?.day_change_percent ?? 0;
  const summary = quote ? (
    <div className="flex items-center gap-3.5 py-2.5">
      <TickerLogo
        ticker={ticker}
        src={profile?.logo_url}
        className="h-9 w-9"
        imageClassName="rounded-lg"
        fallbackClassName="rounded-lg text-[9px]"
      />
      <div className="leading-tight">
        <p className="font-mono text-[14px] font-bold text-snow-peak">{ticker}</p>
        {profile?.name ? <p className="max-w-[14rem] truncate text-[11px] text-mist">{profile.name}</p> : null}
      </div>
      <span className="font-mono text-[18px] font-bold tabular-nums tracking-[-0.02em] text-snow-peak">
        {formatCurrency(quote.price)}
      </span>
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 font-mono text-[12px] font-semibold tabular-nums ring-1 ring-inset",
          dayChangePercent >= 0 ? "bg-bullish/12 text-bullish ring-bullish/25" : "bg-bearish/12 text-bearish ring-bearish/25"
        )}
      >
        {dayChangePercent >= 0 ? "+" : ""}
        {formatPercent(dayChangePercent, 2)}
      </span>
    </div>
  ) : null;

  return (
    <div className="w-full space-y-5">
      <div ref={headerRef}>
      <StockHeader
        profile={profile}
        quote={quote}
        marketIndices={marketIndices}
        marketIndicesLoading={marketIndicesLoading}
        isLoading={profileLoading || quoteLoading}
      />
      </div>

      <StockTabs ticker={ticker} summary={summary} summaryVisible={headerGone} />

      <div className="pt-1">{children}</div>
    </div>
  );
}
