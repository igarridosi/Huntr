"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, Bitcoin, Coins, Droplet, Globe2, Landmark, X, type LucideIcon } from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { useNewsSummary } from "@/hooks/use-stock-data";
import { ROUTES } from "@/lib/constants";
import { cn, formatPercent } from "@/lib/utils";
import { cardSource, involvedSymbols, type AssetTopic, type NewsCard } from "@/lib/market-news";

export interface SymbolInfo {
  name: string;
  /** Fraction, today's move. */
  change: number;
  logo?: string;
  /** An index, a commodity, a yield or a coin: no company page to link to. */
  isIndex?: boolean;
}

const TOPICS: Record<"market" | AssetTopic, { icon: LucideIcon; label: string; subtitle: string; tag: string }> = {
  market: { icon: Globe2, label: "Market", subtitle: "Today's session", tag: "Market" },
  gold: { icon: Coins, label: "Gold", subtitle: "Futures", tag: "Commodity" },
  oil: { icon: Droplet, label: "Crude oil", subtitle: "WTI futures", tag: "Commodity" },
  rates: { icon: Landmark, label: "10Y Treasury", subtitle: "Yield", tag: "Rates" },
  bitcoin: { icon: Bitcoin, label: "Bitcoin", subtitle: "BTC / USD", tag: "Crypto" },
};

export const topicMeta = (topic: "market" | AssetTopic) => TOPICS[topic];

export function TopicIcon({ topic, className }: { topic: "market" | AssetTopic; className?: string }) {
  const Icon = TOPICS[topic].icon;
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunset-orange/10 text-sunset-orange ring-1 ring-inset ring-sunset-orange/25",
        className
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function timeAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function ChangePill({ value, className }: { value: number; className?: string }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[12px] font-semibold tabular-nums",
        up ? "bg-bullish/10 text-bullish" : "bg-bearish/10 text-bearish",
        className
      )}
    >
      {up ? "+" : ""}
      {formatPercent(value, 1)}
    </span>
  );
}

/**
 * A story, read here before leaving for it: headline, the companies and
 * indices it involves (each a way into Huntr), the publisher's own summary,
 * and the button to the full article.
 *
 * A native <dialog> opened with showModal(): the browser gives it the top
 * layer (no ancestor transform can trap it), an inert page behind, focus
 * inside, Escape to close. It opens and closes on CSS transitions
 * (.news-preview in globals.css), so a quick close mid-open reverses
 * smoothly instead of restarting.
 */
export function NewsPreview({
  card,
  open,
  onClose,
  symbols,
  now,
}: {
  card: NewsCard | null;
  open: boolean;
  onClose: () => void;
  symbols: Record<string, SymbolInfo | undefined>;
  now: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Fetched on open only, and kept: reopening the same story is instant.
  const { data, isLoading, isError } = useNewsSummary(
    open && card ? cardSource(card) : null,
    open && card ? card.item.id : null
  );

  const item = card?.item;
  const involved = item ? involvedSymbols(item, (s) => !!symbols[s]) : [];

  return (
    <dialog
      ref={dialog}
      aria-labelledby="news-preview-title"
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself; one inside the panel does not.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="news-preview m-auto w-[calc(100%-2rem)] max-w-xl overflow-visible bg-transparent p-0 text-snow-peak backdrop:bg-transparent"
    >
      {card && item ? (
        <div className="max-h-[min(42rem,calc(100dvh-2rem))] overflow-y-auto rounded-2xl bg-wolf-surface p-5 shadow-2xl ring-1 ring-inset ring-wolf-border/70 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-mist">
              {card.kind === "market" ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-snow-peak">
                  <TopicIcon topic={card.topic} className="h-5 w-5 [&_svg]:h-3 [&_svg]:w-3" />
                  {topicMeta(card.topic).label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium text-snow-peak">
                  <TickerLogo
                    ticker={card.candidate.symbol}
                    src={symbols[card.candidate.symbol]?.logo}
                    className="h-5 w-5"
                    imageClassName="rounded-md"
                    fallbackClassName="rounded-md text-[8px]"
                  />
                  {card.candidate.symbol}
                </span>
              )}
              <span className="truncate">
                {item.publisher || "News"} · {timeAgo(item.publishedAt, now)}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="-m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-mist transition-colors duration-150 hover:bg-snow-peak/[0.06] hover:text-snow-peak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <h2 id="news-preview-title" className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.015em] text-snow-peak sm:text-[21px]">
            {item.title}
          </h2>

          {involved.length > 0 ? (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-mist/80">In this story</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {involved.map((symbol) => {
                  const info = symbols[symbol]!;
                  const content = (
                    <>
                      {info.isIndex ? null : (
                        <TickerLogo ticker={symbol} src={info.logo} className="h-4 w-4" imageClassName="rounded" fallbackClassName="rounded text-[7px]" />
                      )}
                      <span className="font-semibold text-snow-peak">{info.isIndex ? info.name : symbol}</span>
                      <ChangePill value={info.change} className="px-1 py-0 text-[11px]" />
                    </>
                  );
                  const chip = "inline-flex items-center gap-1.5 rounded-lg bg-snow-peak/[0.04] py-1 pl-1.5 pr-1 text-[12px] ring-1 ring-inset ring-wolf-border/50";
                  return (
                    <li key={symbol}>
                      {info.isIndex ? (
                        <span className={chip}>{content}</span>
                      ) : (
                        <Link
                          href={ROUTES.SYMBOL(symbol)}
                          onClick={onClose}
                          className={cn(chip, "transition-colors duration-150 hover:bg-snow-peak/[0.08] hover:ring-wolf-border/80")}
                          title={info.name}
                        >
                          {content}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Space held while the excerpt loads, so the panel does not jump when it lands. */}
          <div className="mt-5 min-h-[4.5rem] border-t border-wolf-border/40 pt-4">
            {isLoading ? (
              <div aria-hidden>
                <Skeleton shape="line" className="h-3.5 w-full" />
                <Skeleton shape="line" className="mt-2.5 h-3.5 w-[92%]" />
                <Skeleton shape="line" className="mt-2.5 h-3.5 w-3/5" />
              </div>
            ) : data?.summary ? (
              // The story's opening, fading out on its last line: there is more to read.
              <p key={item.id} className="news-preview-summary news-preview-excerpt text-[15px] leading-relaxed text-snow-peak/90">
                {data.summary}
              </p>
            ) : (
              <p className="news-preview-summary text-[13px] leading-relaxed text-mist">
                {isError ? "The preview could not be loaded." : "No preview for this story."} The full article has the details.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl bg-sunset-orange px-4 py-2.5 text-[13.5px] font-semibold text-wolf-black",
                "transition-[background-color,transform] duration-150 ease-out hover:bg-sunset-orange/90 active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-wolf-surface",
                "motion-reduce:transition-none motion-reduce:active:scale-100"
              )}
            >
              Continue reading
              <ArrowUpRight className="h-4 w-4" />
            </a>
            <p className="text-center text-[11.5px] text-mist/80 sm:text-left">
              On {item.publisher || "Yahoo Finance"}, in a new tab
            </p>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
