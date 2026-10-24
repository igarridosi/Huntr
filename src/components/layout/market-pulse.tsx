"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFearGreed, useMarketIndices } from "@/hooks/use-stock-data";
import { ROUTES } from "@/lib/constants";
import { zoneOf, type FearGreedZone } from "@/lib/fear-greed";
import { formatCountdown, marketStatus, type MarketPhase } from "@/lib/market-hours";
import { cn, formatPercent } from "@/lib/utils";

// ── A minute clock, client only ────────────────────────────────────────────

/**
 * The current minute, ticking every 20 seconds. Null on the server and in
 * the first client render, so the server's time never meets the reader's
 * in hydration.
 */
let minute = 0;
const readMinute = () => {
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  if (now !== minute) minute = now;
  return minute;
};
const subscribeMinute = (onChange: () => void) => {
  const id = window.setInterval(onChange, 20_000);
  return () => window.clearInterval(id);
};
function useMinute(): number | null {
  return useSyncExternalStore(subscribeMinute, readMinute, () => null);
}

// ── The pulse ──────────────────────────────────────────────────────────────

const PHASE: Record<MarketPhase, { label: string; dot: string; pulse: boolean }> = {
  open: { label: "Market open", dot: "bg-bullish", pulse: true },
  pre: { label: "Pre-market", dot: "bg-golden-hour", pulse: false },
  after: { label: "After hours", dot: "bg-glacier", pulse: false },
  closed: { label: "Market closed", dot: "bg-mist", pulse: false },
};

const FG_TEXT: Record<FearGreedZone, string> = {
  "extreme-fear": "text-bearish",
  fear: "text-sunset-orange",
  neutral: "text-mist",
  greed: "text-glacier",
  "extreme-greed": "text-bullish",
};

const signed = (v: number) => `${v > 0 ? "+" : ""}${formatPercent(v, 2)}`;
const points = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);

/**
 * The top bar's left side, used: where the US market's day stands (with
 * how long until that changes), the three indices, and Huntr's Fear &
 * Greed reading, which opens its card on Insights. The indices give way on
 * a company's page, whose header already shows them.
 */
export function MarketPulse({ className }: { className?: string }) {
  const now = useMinute();
  const pathname = usePathname();
  const { data: indices = [] } = useMarketIndices();
  const { data: fearGreed } = useFearGreed();
  const status = now != null ? marketStatus(new Date(now)) : null;
  const fg = fearGreed?.points.at(-1);
  const showIndices = !pathname?.startsWith("/symbol/");

  return (
    // Each part appears when there is room for it, most useful first: the
    // market's state, then the mood, then the indices. Never under the
    // buttons on the right: the box clips rather than overflows.
    <div className={cn("flex min-w-0 items-center gap-3 overflow-hidden", className)}>
      {status ? (
        <span
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-wolf-surface/50 px-2.5 py-1.5 text-[12px] ring-1 ring-inset ring-wolf-border/50"
          title={status.earlyClose ? "Early close today: the session ends at 1:00 pm New York time" : "US equities, New York time"}
        >
          <span className="relative flex h-2 w-2">
            {PHASE[status.phase].pulse ? (
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none", PHASE[status.phase].dot)} />
            ) : null}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", PHASE[status.phase].dot)} />
          </span>
          <span className="font-medium text-snow-peak">{PHASE[status.phase].label}</span>
          {/* A thin rule, its own element, so the pill's gap sits evenly either side. */}
          <span className="hidden h-3.5 w-px bg-mist/45 2xl:inline-block" aria-hidden />
          <span className="hidden text-mist 2xl:inline">
            {status.next} {status.nextDayLabel ? `${status.nextDayLabel} 9:30 ET` : `in ${formatCountdown(status.minutesLeft)}`}
          </span>
        </span>
      ) : (
        <span className="h-[30px] w-28 shrink-0 rounded-lg bg-wolf-surface/40" aria-hidden />
      )}

      {showIndices && indices.length > 0 ? (
        <ul className="hidden min-w-0 items-center gap-4 2xl:flex" aria-label="US indices today">
          {indices.map((index) => (
            <li key={index.symbol} className="flex shrink-0 items-baseline gap-1.5 text-[12px]">
              <span className="text-mist">{index.label}</span>
              <span className="hidden font-mono tabular-nums text-snow-peak/90 min-[1800px]:inline">{points(index.price)}</span>
              <span className={cn("font-mono font-semibold tabular-nums", index.change_percent >= 0 ? "text-bullish" : "text-bearish")}>
                {signed(index.change_percent)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {fg ? (
        <Link
          href={`${ROUTES.APP}#fear-greed`}
          className="hidden shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-wolf-surface/60 lg:inline-flex"
          title="Huntr's Fear & Greed index: how investors feel, 0 to 100"
        >
          <span className="text-mist">Fear &amp; Greed</span>
          <span className={cn("font-mono font-semibold tabular-nums", FG_TEXT[zoneOf(fg.value).zone])}>{fg.value}</span>
          <span className={cn("hidden xl:inline", FG_TEXT[zoneOf(fg.value).zone])}>{zoneOf(fg.value).label}</span>
        </Link>
      ) : null}
    </div>
  );
}
