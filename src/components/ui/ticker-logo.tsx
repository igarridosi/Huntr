"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_FALLBACK_SRC = "https://www.allinvestview.com/favicon.ico";

interface TickerLogoProps {
  ticker: string;
  src?: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  fallbackSrc?: string;
}

export function TickerLogo({
  ticker,
  src,
  className,
  imageClassName,
  fallbackClassName,
  fallbackSrc = DEFAULT_FALLBACK_SRC,
}: TickerLogoProps) {
  const symbol = ticker.toUpperCase();
  const candidates = useMemo(() => {
    const list = [
      src,
      `https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}?format=png`,
      `https://eodhd.com/img/logos/US/${encodeURIComponent(symbol)}.png`,
      fallbackSrc,
    ].filter((value): value is string => !!value);

    return Array.from(new Set(list));
  }, [src, symbol, fallbackSrc]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(candidates[0] ?? fallbackSrc);
  const [showInitials, setShowInitials] = useState(false);
  const [attemptedSymbolLookup, setAttemptedSymbolLookup] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setCurrentSrc(candidates[0] ?? fallbackSrc);
    setShowInitials(false);
    setAttemptedSymbolLookup(false);
  }, [candidates, fallbackSrc]);

  useEffect(() => {
    let cancelled = false;

    const tryResolveWithoutSource = async () => {
      if (attemptedSymbolLookup) return;

      setAttemptedSymbolLookup(true);
      const resolved = await resolveLogoFromSymbol();
      if (!cancelled && resolved) {
        setCurrentSrc(resolved);
      }
    };

    void tryResolveWithoutSource();

    return () => {
      cancelled = true;
    };
  }, [attemptedSymbolLookup, ticker]);

  const resolveLogoFromSymbol = async (): Promise<string | null> => {
    try {
      const response = await fetch(
        `https://www.allinvestview.com/api/logo-search/?q=${encodeURIComponent(ticker)}`
      );
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        results?: Array<{ symbol?: string; website?: string }>;
      };

      const results = payload.results ?? [];
      if (!results.length) return null;

      const exact = results.find(
        (r) => (r.symbol ?? "").toUpperCase() === ticker.toUpperCase()
      );
      const picked = exact ?? results[0];
      const website = (picked.website ?? "").trim().toLowerCase();
      if (!website) return null;

      const normalized = website
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/$/, "");

      if (!normalized) return null;
      return `https://cdn.tickerlogos.com/${normalized}`;
    } catch {
      return null;
    }
  };

  const handleError = async () => {
    if (sourceIndex + 1 < candidates.length) {
      const nextIndex = sourceIndex + 1;
      setSourceIndex(nextIndex);
      setCurrentSrc(candidates[nextIndex]);
      return;
    }

    if (!attemptedSymbolLookup) {
      setAttemptedSymbolLookup(true);
      const resolved = await resolveLogoFromSymbol();
      if (resolved) {
        setCurrentSrc(resolved);
        return;
      }
    }

    setShowInitials(true);
  };

  return (
    <div className={cn("relative shrink-0", className)}>
      {!showInitials ? (
        <img
          src={currentSrc}
          alt={`${ticker} logo`}
          className={cn("h-full w-full object-contain rounded-[8px]", imageClassName)}
          onError={handleError}
          loading="lazy"
        />
      ) : (
        <div
          className={cn(
            "h-full w-full flex items-center justify-center rounded-[8px] bg-snow-peak text-xs font-bold text-wolf-black",
            fallbackClassName
          )}
        >
          {ticker.slice(0, 2)}
        </div>
      )}
    </div>
  );
}
