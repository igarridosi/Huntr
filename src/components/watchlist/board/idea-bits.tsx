import { cn } from "@/lib/utils";
import { HG_RULES } from "@/lib/hunting-ground";
import type { FairValue, IdeaEvent, Stance } from "@/lib/watchlist/ideas";

/** A price in the currency it is quoted in. */
export function money(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value >= 1000 ? 0 : 2,
      minimumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

export function pct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function signedPct(value: number, decimals = 2): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value * 100).toFixed(decimals)}%`;
}

export const STANCE_TEXT: Record<Stance, string> = {
  buy: "text-bullish",
  near: "text-golden-hour",
  far: "text-mist",
  none: "text-mist/70",
};

const STANCE_FILL: Record<Stance, string> = {
  buy: "bg-bullish",
  near: "bg-golden-hour",
  far: "bg-mist/50",
  none: "bg-mist/30",
};

export const STANCE_LABEL: Record<Stance, string> = {
  buy: "Buy zone",
  near: "Getting close",
  far: "Waiting",
  none: "No fair value",
};

/** "12% below $364", "4% above $364". */
export function gapText(gap: number, fair: FairValue, currency?: string): string {
  const side = gap <= 0 ? "below" : "above";
  return `${Math.abs(gap * 100).toFixed(0)}% ${side} ${money(fair.value, currency)}`;
}

export function fairSource(fair: FairValue): string {
  if (fair.source === "target") return "Your buy price";
  return fair.scenario && fair.scenario !== "base" ? `Your DCF · ${fair.scenario}` : "Your DCF";
}

/**
 * How far the price has to travel to the fair value, as a bar that empties
 * as it gets closer: full at 50% above, empty at the line, and a solid
 * green once it is below.
 */
export function GapBar({ gap, stance, className }: { gap: number; stance: Stance; className?: string }) {
  const fill = gap <= 0 ? 1 : Math.max(0.04, 1 - Math.min(gap, 0.5) / 0.5);
  return (
    <span className={cn("block h-1 w-full overflow-hidden rounded-full bg-snow-peak/[0.06]", className)}>
      <span
        className={cn("block h-full origin-left rounded-full transition-transform duration-300 ease-[var(--ease-settle)]", STANCE_FILL[stance])}
        style={{ transform: `scaleX(${fill})` }}
      />
    </span>
  );
}

export function eventText(event: IdeaEvent): string {
  const when = event.days === 0 ? "today" : event.days === 1 ? "tomorrow" : `in ${event.days}d`;
  return `${event.kind === "earnings" ? "Earnings" : "Ex-dividend"} ${when}`;
}

export function qualityTone(q: number): string {
  if (q >= HG_RULES.QUALITY_LINE + 15) return "text-bullish";
  if (q >= HG_RULES.QUALITY_LINE) return "text-snow-peak";
  if (q >= 40) return "text-golden-hour";
  return "text-bearish";
}

export function yieldTone(y: number): string {
  if (y >= HG_RULES.CHEAP_YIELD) return "text-bullish";
  if (y >= 0) return "text-snow-peak";
  return "text-bearish";
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
