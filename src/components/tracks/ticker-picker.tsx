"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useSearch } from "@/hooks/use-stock-data";
import { cn } from "@/lib/utils";

interface TickerPickerProps {
  value: string;
  onPick: (ticker: string) => void;
  placeholder?: string;
}

/**
 * A ticker field with suggestions from the product's own search index.
 * Enter takes the first match, or the typed symbol when nothing matches —
 * EDGAR knows more issuers than the index does.
 */
export function TickerPicker({ value, onPick, placeholder = "Search a company or ticker" }: TickerPickerProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrap = useRef<HTMLDivElement | null>(null);
  const { data = [] } = useSearch(query.trim(), 8);
  const results = open ? data.slice(0, 8) : [];

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (t: string) => {
    const sym = t.trim().toUpperCase();
    if (!sym) return;
    setQuery(sym);
    setOpen(false);
    onPick(sym);
  };

  return (
    <div ref={wrap} className="relative w-full sm:max-w-sm">
      <div className="flex items-center gap-2 rounded-xl border border-wolf-border/60 bg-wolf-black/40 px-3 focus-within:border-sunset-orange/50 focus-within:ring-2 focus-within:ring-sunset-orange/20">
        <Search className="h-4 w-4 shrink-0 text-mist" aria-hidden />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); pick(results[active]?.ticker ?? query); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          aria-label="Ticker"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          className="h-10 w-full bg-transparent text-sm text-snow-peak placeholder:text-mist/60 focus:outline-none"
        />
      </div>

      {results.length > 0 ? (
        <ul id={listId} role="listbox" className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-wolf-border/60 bg-wolf-surface/95 p-1 shadow-2xl shadow-wolf-black/60 backdrop-blur-xl">
          {results.map((r, i) => (
            <li key={r.ticker} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r.ticker)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  i === active ? "bg-snow-peak/[0.06] text-snow-peak" : "text-mist"
                )}
              >
                <span className="truncate">{r.name}</span>
                <span className="font-mono text-xs text-sunset-orange">{r.ticker}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
