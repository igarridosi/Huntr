"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, EyeOff, Newspaper, Rows2, Rows3 } from "lucide-react";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/insights/section-header";
import { ChangePill, NewsPreview, TopicIcon, timeAgo, topicMeta, type SymbolInfo } from "@/components/insights/news-preview";
import type { NewsLayout } from "@/components/insights/use-news-layout";
import { cn } from "@/lib/utils";
import { biggestMover, NEWS_INDICES, type NewsCard, type NewsReason } from "@/lib/market-news";

const REASON_LABEL: Record<NewsReason, string> = {
  "big-move": "Big move",
  "large-cap": "Large cap",
  "mega-cap": "Mega cap",
  trending: "Unusual volume",
};

type Symbols = Record<string, SymbolInfo | undefined>;
type Density = Exclude<NewsLayout, "hidden">;

/** Card widths and the skeleton's height, per density. */
const SIZE: Record<Density, { width: string; skeleton: string }> = {
  normal: { width: "w-[16.5rem] sm:w-[17.5rem]", skeleton: "h-[7rem]" },
  compact: { width: "w-[14rem] sm:w-[15rem]", skeleton: "h-[4.75rem]" },
};

/**
 * "What's moving the market", in two rows: Markets (the indices, gold, oil, rates,
 * bitcoin) and Stocks (the stories behind the day's standout moves). Each
 * row scrolls sideways by hand, never on its own: a headline that moves
 * while it is being read is lost. A card opens a preview here; the article
 * is one more click away. A row with nothing in it is not shown, and the
 * section neither when both are empty; see src/lib/market-news.ts.
 *
 * The reader can make the cards compact, or hide the section down to a
 * single line that brings it back (`layout`, kept per browser).
 */
function MarketNewsView({
  marketCards,
  stockCards,
  symbols,
  marketLoading,
  stockLoading,
  now,
  layout,
  onLayoutChange,
}: {
  marketCards: NewsCard[];
  stockCards: NewsCard[];
  /** What the page knows about each symbol: name, logo, today's move. */
  symbols: Symbols;
  marketLoading: boolean;
  stockLoading: boolean;
  /** When the headlines were fetched: what "2h ago" is measured from. */
  now: number;
  layout: NewsLayout;
  onLayoutChange: (layout: NewsLayout) => void;
}) {
  // Kept after closing, so the preview still has its content while it leaves.
  const [selected, setSelected] = useState<NewsCard | null>(null);
  const [open, setOpen] = useState(false);
  const openCard = useCallback((card: NewsCard) => {
    setSelected(card);
    setOpen(true);
  }, []);

  if (layout === "hidden") {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <p className="flex min-w-0 items-center gap-2.5 text-[12.5px] text-mist">
            <Newspaper className="h-4 w-4 shrink-0 text-sunset-orange/80" />
            <span className="truncate">
              <span className="font-medium text-snow-peak/85">What&apos;s moving the market</span> is hidden
            </span>
          </p>
          <button
            type="button"
            onClick={() => onLayoutChange("normal")}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-mist ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-snow-peak/[0.05] hover:text-snow-peak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60"
          >
            Show <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </CardContent>
      </Card>
    );
  }

  const showMarkets = marketLoading || marketCards.length > 0;
  const showStocks = stockLoading || stockCards.length > 0;
  if (!showMarkets && !showStocks) return null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <section aria-labelledby="market-news-title">
          <SectionHeader icon={Newspaper} title="What's moving the market" titleId="market-news-title">
            <LayoutControls layout={layout} onChange={onLayoutChange} />
          </SectionHeader>
          <div className={cn("mt-4", layout === "compact" ? "space-y-3" : "space-y-4")}>
            {showMarkets ? (
              <NewsRow label="Markets" hint="Indices, commodities, rates, crypto" cards={marketCards} loading={marketLoading} density={layout} symbols={symbols} now={now} onOpen={openCard} />
            ) : null}
            {showStocks ? (
              <NewsRow label="Stocks" hint="The day's standout moves" cards={stockCards} loading={stockLoading} density={layout} symbols={symbols} now={now} onOpen={openCard} />
            ) : null}
          </div>
          <NewsPreview card={selected} open={open} onClose={() => setOpen(false)} symbols={symbols} now={now} />
        </section>
      </CardContent>
    </Card>
  );
}

/** Memoised: the page re-renders on every query it runs; the rows follow only their own props. */
export const MarketNews = memo(MarketNewsView);

/** Normal / compact, and hide: a choice made now and then, so it changes instantly. */
function LayoutControls({ layout, onChange }: { layout: Density; onChange: (layout: NewsLayout) => void }) {
  const option = "flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60";
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div role="radiogroup" aria-label="Card size" className="flex items-center rounded-lg p-0.5 ring-1 ring-inset ring-wolf-border/50">
        {(
          [
            { value: "normal", label: "Normal cards", Icon: Rows2 },
            { value: "compact", label: "Compact cards", Icon: Rows3 },
          ] as const
        ).map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={layout === value}
            aria-label={label}
            title={label}
            onClick={() => onChange(value)}
            className={cn(option, layout === value ? "bg-snow-peak/[0.08] text-snow-peak" : "text-mist hover:text-snow-peak")}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange("hidden")}
        aria-label="Hide this section"
        title="Hide this section"
        className={cn(option, "text-mist ring-1 ring-inset ring-wolf-border/50 hover:bg-snow-peak/[0.05] hover:text-snow-peak")}
      >
        <EyeOff className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function NewsRow({
  label,
  hint,
  cards,
  loading,
  density,
  symbols,
  now,
  onOpen,
}: {
  label: string;
  hint: string;
  cards: NewsCard[];
  loading: boolean;
  density: Density;
  symbols: Symbols;
  now: number;
  onOpen: (card: NewsCard) => void;
}) {
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, cards.length, density]);

  const page = (direction: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-mist">{label}</span>
          <span className="truncate text-[11.5px] text-mist/60">{hint}</span>
        </p>
        {cards.length > 0 ? (
          <div className="hidden shrink-0 gap-1 sm:flex">
            {([-1, 1] as const).map((direction) => {
              const disabled = direction === -1 ? edges.start : edges.end;
              const Icon = direction === -1 ? ChevronLeft : ChevronRight;
              return (
                <button
                  key={direction}
                  type="button"
                  onClick={() => page(direction)}
                  disabled={disabled}
                  aria-label={direction === -1 ? `Previous ${label.toLowerCase()} headlines` : `More ${label.toLowerCase()} headlines`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-mist ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-snow-peak/[0.05] hover:text-snow-peak disabled:pointer-events-none disabled:opacity-35"
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <ul
        ref={scroller}
        onScroll={measure}
        className={cn(
          "-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-smooth px-1 pb-1",
          "[-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        )}
        // Inline: the global `* { scrollbar-width: thin }` in globals.css sits
        // outside Tailwind's layers and beats the utility class.
        style={{ scrollbarWidth: "none" }}
      >
        {loading && cards.length === 0
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i} className={cn("shrink-0", SIZE[density].width)} aria-hidden>
                <div className={cn("rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/40", SIZE[density].skeleton)}>
                  <Skeleton shape="line" className="h-3 w-24" />
                  <Skeleton shape="line" className="mt-3 h-3 w-full" />
                  <Skeleton shape="line" className="mt-2 h-3 w-4/5" />
                </div>
              </li>
            ))
          : cards.map((card) => (
              <li key={card.item.id} className={cn("shrink-0 snap-start", SIZE[density].width)}>
                <NewsCardButton card={card} density={density} symbols={symbols} now={now} onOpen={onOpen} />
              </li>
            ))}
      </ul>
    </div>
  );
}

/**
 * One story. Both kinds share the surface; the shape tells them apart:
 * a market card has round corners and a round topic badge, a company card
 * squarer corners and the company's square logo.
 */
function NewsCardButton({
  card,
  density,
  symbols,
  now,
  onOpen,
}: {
  card: NewsCard;
  density: Density;
  symbols: Symbols;
  now: number;
  onOpen: (card: NewsCard) => void;
}) {
  const compact = density === "compact";
  const isMarket = card.kind === "market";
  let title: string;
  let subtitle: string;
  let change: number | undefined;
  let tag: string;

  if (card.kind === "market") {
    const meta = topicMeta(card.topic);
    tag = meta.tag;
    if (card.topic === "market") {
      // A wrap leads with the index it is about that moved most.
      const lead = biggestMover(card.item, [...NEWS_INDICES], (s) => symbols[s]?.change) ?? "^GSPC";
      title = compact && symbols[lead] ? symbols[lead]!.name : "Market";
      subtitle = symbols[lead] ? `${symbols[lead]!.name} today` : "Today's session";
      change = symbols[lead]?.change;
    } else {
      title = meta.label;
      subtitle = meta.subtitle;
      change = symbols[card.source]?.change;
    }
  } else {
    title = card.candidate.symbol;
    subtitle = card.candidate.label;
    change = card.candidate.changePercent;
    tag = REASON_LABEL[card.candidate.reason];
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      aria-haspopup="dialog"
      className={cn(
        "group flex h-full w-full flex-col bg-snow-peak/[0.025] text-left ring-1 ring-inset ring-wolf-border/40",
        isMarket ? "rounded-[1.25rem]" : "rounded-lg",
        compact ? "p-2.5" : "p-3",
        "transition-[background-color,box-shadow] duration-150 ease-out hover:bg-snow-peak/[0.05] hover:ring-wolf-border/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60"
      )}
    >
      <div className="flex w-full items-center gap-2">
        {card.kind === "market" ? (
          <TopicIcon topic={card.topic} className={compact ? "h-5 w-5 [&_svg]:h-3 [&_svg]:w-3" : "h-6 w-6 [&_svg]:h-3.5 [&_svg]:w-3.5"} />
        ) : (
          <TickerLogo
            ticker={card.candidate.symbol}
            src={symbols[card.candidate.symbol]?.logo}
            className={compact ? "h-5 w-5" : "h-6 w-6"}
            imageClassName="rounded-md"
            fallbackClassName="rounded-md text-[8px]"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold leading-tight text-snow-peak">{title}</p>
          {compact ? null : <p className="truncate text-[10.5px] leading-tight text-mist">{subtitle}</p>}
        </div>
        {change != null ? <ChangePill value={change} className={compact ? "px-1 py-0 text-[11px]" : "text-[11.5px]"} /> : null}
      </div>

      <p
        className={cn(
          "mt-2 line-clamp-2 font-medium leading-snug text-snow-peak/95 group-hover:text-snow-peak",
          compact ? "text-[12px]" : "text-[13px]"
        )}
      >
        {card.item.title}
      </p>

      {compact ? null : (
        <div className="mt-auto flex w-full items-center gap-1.5 pt-2 text-[11px] text-mist">
          <span className="truncate">{card.item.publisher || "News"}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{timeAgo(card.item.publishedAt, now)}</span>
          <span className="ml-auto shrink-0 rounded-md bg-snow-peak/[0.05] px-1.5 py-px text-[10px] text-mist ring-1 ring-inset ring-wolf-border/40">
            {tag}
          </span>
        </div>
      )}
    </button>
  );
}
