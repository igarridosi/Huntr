"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useQueryClient } from "@tanstack/react-query";
import { Search, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES, QUERY_KEYS, STALE_TIMES } from "@/lib/constants";
import { useSearch } from "@/hooks/use-stock-data";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { fetchStockProfile, fetchStockQuote, fetchFullStockData } from "@/app/actions/stock";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { CompactLabel } from "@/components/ui/compact-label";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectTo?: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  redirectTo,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  // Cmd+K shortcut to toggle
  useKeyboardShortcut(
    { key: "k", metaKey: true },
    () => onOpenChange(!open),
    true
  );

  // Search results from hook
  const { data: results = [], isFetching } = useSearch(query, 20);

  // Reset query on close
  useEffect(() => {
    if (!open) {
      setQuery("");
    } else {
      // Focus input when opened
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Prefetch stock data on hover/keyboard navigation
  const prefetchTicker = useCallback(
    (ticker: string) => {
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.STOCK_PROFILE(ticker),
        queryFn: () => fetchStockProfile(ticker),
        staleTime: STALE_TIMES.STATIC,
      });
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.STOCK_QUOTE(ticker),
        queryFn: () => fetchStockQuote(ticker),
        staleTime: STALE_TIMES.QUOTE,
      });
    },
    [queryClient]
  );

  // Navigate to stock detail
  const handleSelect = useCallback(
    (ticker: string) => {
      // Fire-and-forget warmup to persist data in shared server cache.
      void fetchFullStockData(ticker).catch(() => null);
      onOpenChange(false);
      router.push(redirectTo ?? ROUTES.SYMBOL(ticker));
    },
    [onOpenChange, redirectTo, router]
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onOpenChange]);

  // Lock page scroll while open — the palette is the only thing meant to move.
  // <html> is the actual scrolling box in standards mode, so body alone isn't
  // enough to stop it, and iOS Safari ignores overflow: hidden for touch
  // scrolling entirely — so wheel/touchmove are blocked directly too.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const blockScroll = (event: Event) => {
      if (event.target instanceof Node && paletteRef.current?.contains(event.target)) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener("wheel", blockScroll, { passive: false });
    document.addEventListener("touchmove", blockScroll, { passive: false });

    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("wheel", blockScroll);
      document.removeEventListener("touchmove", blockScroll);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  // Rendered into <body> on purpose. Inline, the palette inherits whatever
  // subtree it was mounted in — the hero wraps it in a transformed, z-indexed,
  // centered block, which pinned `fixed` to that box, trapped z-[100] beneath
  // the side menu's z-50, and centred the result text. The portal escapes all
  // three so the overlay covers the viewport and veils everything under it.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh] text-left">
      {/* Backdrop — sits above the floating side menu (z-50) so it reads as
          veiled and inactive, not layered underneath the palette. */}
      <div
        className="fixed inset-0 bg-wolf-black/70 backdrop-blur-md"
        onClick={() => onOpenChange(false)}
      />

      {/* Palette */}
      <div ref={paletteRef} className="relative z-50 w-full max-w-xl mx-4">
        <Command
          className={cn(
            "popover-materialize origin-top overflow-hidden rounded-xl bg-wolf-surface shadow-2xl ring-1 ring-inset ring-wolf-border/60",
            "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.09em] [&_[cmdk-group-heading]]:text-mist/50"
          )}
          shouldFilter={false}
        >
          {/* Search Input */}
          <div className="flex items-center border-b border-wolf-border/40 px-4">
            <Search className="w-4 h-4 shrink-0 text-mist/60" />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="Search tickers, companies..."
              className={cn(
                "flex-1 h-12 bg-transparent text-sm text-snow-peak",
                "placeholder:text-mist/50 outline-none border-none px-3",
                "font-medium"
              )}
            />
            <kbd className="hidden items-center rounded-md bg-snow-peak/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-mist/50 ring-1 ring-inset ring-wolf-border/40 sm:inline-flex">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="scroll-quiet max-h-[320px] overflow-y-auto p-2">
            <Command.Empty className="py-6">
              <SearchEmptySkeleton isFetching={isFetching} query={query} />
            </Command.Empty>

            {results.length > 0 && (
              <Command.Group heading="Stocks">
                {results.map((entry) => (
                  <Command.Item
                    key={entry.ticker}
                    value={entry.ticker}
                    onSelect={() => handleSelect(entry.ticker)}
                    onMouseEnter={() => prefetchTicker(entry.ticker)}
                    onFocus={() => prefetchTicker(entry.ticker)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3",
                      "text-snow-peak transition-[background-color,color,transform] duration-150 ease-out",
                      "active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100",
                      "data-[selected=true]:bg-sunset-orange/10 data-[selected=true]:text-sunset-orange",
                      "hover:bg-snow-peak/[0.05] aria-selected:bg-sunset-orange/10"
                    )}
                  >
                    {/* Ticker logo */}
                    <TickerLogo
                      ticker={entry.ticker}
                      src={entry.logo_url}
                      className="w-12 h-12"
                      imageClassName="rounded-[8px]"
                      fallbackClassName="rounded-[8px] text-sm"
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base font-mono tracking-tight">
                          {entry.ticker}
                        </span>
                        <span className="shrink-0 rounded-md bg-snow-peak/[0.05] px-1.5 py-0.5 text-[11px] text-mist/70">
                          {entry.sector}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[15px] font-medium leading-snug text-snow-peak/85">
                        <CompactLabel text={entry.name} />
                      </p>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="w-4 h-4 text-mist/30 shrink-0" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-wolf-border/40 px-4 py-2 font-mono text-[10px] text-mist/40">
            <span>
              <kbd className="mr-1 rounded bg-snow-peak/[0.05] px-1 py-0.5 ring-1 ring-inset ring-wolf-border/40">↑↓</kbd>
              navigate
              <kbd className="mx-1 rounded bg-snow-peak/[0.05] px-1 py-0.5 ring-1 ring-inset ring-wolf-border/40">↵</kbd>
              select
            </span>
            <span className="tabular-nums">{results.length} result{results.length !== 1 ? "s" : ""}</span>
          </div>
        </Command>
      </div>
    </div>,
    document.body
  );
}

/**
 * What fills the results area before the results do.
 *
 * The old version showed two grey bars that matched nothing, a line of text,
 * and three dots pulsing on a 2s cycle - slow enough to read as the page
 * having stalled rather than as work in progress. And when the results landed
 * the box jumped from that shape to a completely different one.
 *
 * These placeholders are the real row: the same 48px logo, the same two lines
 * of text at the same sizes. So the panel is already the right shape when the
 * data arrives and only the content changes. The shimmer is the activity
 * signal on its own, which lets the dots go - one moving thing rather than
 * three competing ones.
 */
function SearchEmptySkeleton({
  isFetching,
  query,
}: {
  isFetching: boolean;
  query: string;
}) {
  const hasQuery = query.trim().length > 0;

  if (!isFetching) {
    return (
      <div className="rounded-xl bg-snow-peak/[0.02] px-4 py-5 text-center ring-1 ring-inset ring-wolf-border/40">
        <p className="text-sm text-mist/80">
          {hasQuery
            ? "We couldn't find that stock. Try another ticker symbol or name."
            : "Start typing to search for stocks."}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl bg-snow-peak/[0.02] p-2 ring-1 ring-inset ring-wolf-border/40"
      role="status"
      aria-label="Searching symbols"
    >
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg px-3 py-3">
          <div
            className="huntr-skeleton h-12 w-12 shrink-0 rounded-[8px]"
            style={{ "--shimmer-delay": `${index * 120}ms` } as React.CSSProperties}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div
                className="huntr-skeleton h-4 w-16 rounded"
                style={{ "--shimmer-delay": `${index * 120 + 60}ms` } as React.CSSProperties}
              />
              <div
                className="huntr-skeleton h-4 w-20 rounded"
                style={{ "--shimmer-delay": `${index * 120 + 90}ms` } as React.CSSProperties}
              />
            </div>
            {/* Rows shorten as they descend, so the block reads as a list
                trailing off rather than as three identical bars. */}
            <div
              className="huntr-skeleton h-3.5 rounded"
              style={
                {
                  width: `${70 - index * 12}%`,
                  "--shimmer-delay": `${index * 120 + 120}ms`,
                } as React.CSSProperties
              }
            />
          </div>
        </div>
      ))}

      <p className="pb-1 pt-2 text-center text-[10px] font-medium uppercase tracking-[0.09em] text-mist/50">
        Searching symbols
      </p>
    </div>
  );
}
