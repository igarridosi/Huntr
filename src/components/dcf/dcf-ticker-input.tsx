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
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
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
    [onSelect]
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
            "w-full h-10 pl-10 pr-4 rounded-lg text-sm font-mono",
            "bg-wolf-black/60 border border-wolf-border/50",
            "text-snow-peak placeholder:text-mist/60",
            "focus:outline-none focus:ring-1 focus:ring-sunset-orange/50 focus:border-sunset-orange/40",
            "transition-all"
          )}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mist animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-wolf-border/50 bg-wolf-surface shadow-xl overflow-hidden">
          {results.map((r) => (
            <button
              key={r.ticker}
              type="button"
              onClick={() => handleSelect(r.ticker)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors",
                "hover:bg-sunset-orange/10 cursor-pointer",
                r.ticker === value && "bg-sunset-orange/5"
              )}
            >
              <TickerLogo ticker={r.ticker} className="w-6 h-6 rounded" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-semibold text-snow-peak truncate">
                  {r.ticker}
                </p>
                <p className="text-[11px] text-mist truncate">{r.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
