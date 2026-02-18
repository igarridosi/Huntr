"use client";

import { useEffect, useState } from "react";
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
  const [currentSrc, setCurrentSrc] = useState(src || fallbackSrc);
  const [showInitials, setShowInitials] = useState(false);
  const [attemptedSymbolLookup, setAttemptedSymbolLookup] = useState(false);

  useEffect(() => {
    setCurrentSrc(src || fallbackSrc);
    setShowInitials(false);
    setAttemptedSymbolLookup(false);
  }, [src, fallbackSrc]);

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
    if (!attemptedSymbolLookup) {
      setAttemptedSymbolLookup(true);
      const resolved = await resolveLogoFromSymbol();
      if (resolved) {
        setCurrentSrc(resolved);
        return;
      }
    }

    if (currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      return;
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
