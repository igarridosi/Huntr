"use client";

import { TickerLogo } from "@/components/ui/ticker-logo";
import { cn } from "@/lib/utils";
import type { StockProfile } from "@/types/stock";

interface DataHuntingLoaderProps {
  ticker?: string;
  profile?: StockProfile | null;
  className?: string;
  compact?: boolean;
  detailMessage?: string;
}

export function DataHuntingLoader({
  ticker,
  profile,
  className,
  compact = false,
  detailMessage,
}: DataHuntingLoaderProps) {
  const symbol = ticker?.toUpperCase() || profile?.ticker || "TICKER";
  const hasProfile = !!profile;
  const pipelineStages = compact
    ? ["Profile", "Quote", "20Y history"]
    : ["Profile", "Quote", "20Y history", "KPIs", "Charts"];

  return (
    <div
      className={cn(
        "rounded-xl border border-wolf-border/50 bg-wolf-surface px-6 py-8",
        className
      )}
    >
      <div className={cn("grid gap-6", compact ? "md:grid-cols-[1fr_auto]" : "md:grid-cols-[1.2fr_auto]") }>
        <div className="space-y-4">
          {hasProfile ? (
            <div className="flex items-center gap-3">
              <TickerLogo
                ticker={profile.ticker}
                src={profile.logo_url}
                className="w-12 h-12"
                imageClassName="rounded-[8px]"
                fallbackClassName="rounded-[8px]"
              />

              <div>
                <p className="text-base font-semibold text-snow-peak leading-tight">
                  {profile.name}
                </p>
                <p className="text-xs text-mist mt-1">
                  <span className="font-mono font-semibold text-sunset-orange">
                    {profile.ticker}
                  </span>
                  {profile.exchange ? <span> · {profile.exchange}</span> : null}
                  {profile.sector ? <span> · {profile.sector}</span> : null}
                </p>
              </div>
            </div>
          ) : null}

          <p className="text-lg font-semibold text-snow-peak">
            We are Hunting all the data for {symbol}
          </p>
          <p className="text-sm text-mist">
            Crunching statements, validating signals and preparing your charts...
          </p>
          {detailMessage ? <p className="text-xs text-sunset-orange/80">{detailMessage}</p> : null}

          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {pipelineStages.map((stage, index) => (
                <span
                  key={stage}
                  className="inline-flex items-center rounded-full border border-sunset-orange/15 bg-sunset-orange/10 px-2.5 py-1 text-[10px] font-mono text-sunset-orange/90"
                  style={{ animationDelay: `${index * 140}ms` }}
                >
                  {stage}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2 justify-start md:justify-end">
          {[18, 34, 26, 48, 32, 56, 42, 62].map((h, i) => (
            <div
              key={`${h}-${i}`}
              className="w-3 rounded-sm bg-sunset-orange/80 animate-pulse"
              style={{
                height: `${h}px`,
                animationDelay: `${i * 120}ms`,
                animationDuration: "1200ms",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
