"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { useSearch } from "@/hooks/use-stock-data";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { cn } from "@/lib/utils";

interface DCFTickerInputProps {
  value: string;
  onSelect: (ticker: string) => void;
}

export function DCFTickerInput({ value, onSelect }: DCFTickerInputProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results = [], isLoading } = useSearch(query, 8);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = useCallback(
    (ticker: string) => {
      setQuery(ticker);
      setOpen(false);
      onSelect(ticker);
    },
    [onSelect],
  );

  return (
    <div ref={wrapperRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mist" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search ticker... (e.g. AAPL)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className={cn(
            "h-10 w-full rounded-xl pl-10 pr-4 font-mono text-sm",
            // A recessed well is right for a field: the ring lives inside the
            // shape so focus tightens the same outline instead of adding a
            // second one outside it, and nothing reflows on focus.
            "bg-wolf-black/60 text-snow-peak ring-1 ring-inset ring-wolf-border/50 placeholder:text-mist/60",
            "transition-[box-shadow] duration-150 ease-out",
            "focus:outline-none focus:ring-2 focus:ring-sunset-orange/50",
            "motion-reduce:transition-none",
          )}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mist animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="popover-materialize absolute z-50 mt-1.5 w-full origin-top overflow-hidden rounded-xl bg-wolf-surface/95 shadow-2xl ring-1 ring-inset ring-wolf-border/60 backdrop-blur-xl">
          {/* Six rows, then scroll. A panel that grew with the result count
              covered the controls under it and gave no sense of how long the
              list was; a fixed window makes the panel a predictable size, and
              the sliver of the seventh row is what says "there is more".
              A row lays out at 3.5625rem, so six of them come to 21.375rem;
              the window is 21.9rem, which leaves about half a centimetre of the
              seventh showing. Kept in rem so it tracks the user's text size
              rather than pinning to a pixel count. overflow-x is clipped
              because the rows already truncate: left to auto, a hairline of
              horizontal overflow added a 10px scrollbar along the bottom that
              ate the sixth row. */}
          <div className="scroll-quiet max-h-[21.9rem] overflow-y-auto overflow-x-hidden">
            {results.map((r) => (
              <button
                key={r.ticker}
                type="button"
                onClick={() => handleSelect(r.ticker)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left",
                  "transition-[background-color,transform] duration-150 ease-out",
                  "hover:bg-sunset-orange/10 active:scale-[0.99]",
                  "focus-visible:outline-none focus-visible:bg-sunset-orange/10",
                  "motion-reduce:transition-none motion-reduce:active:scale-100",
                  r.ticker === value && "bg-sunset-orange/5",
                )}
              >
                <TickerLogo
                  ticker={r.ticker}
                  className="h-6 w-6"
                  imageClassName="rounded-md"
                  fallbackClassName="rounded-md text-[8px]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-semibold text-snow-peak truncate">
                    {r.ticker}
                  </p>
                  <p className="text-[11px] text-mist truncate">{r.name}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
