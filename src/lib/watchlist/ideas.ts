/**
 * A watchlist read as a list of ideas, each with the price at which it
 * becomes a buy: the question a value investor brings to it is "which of
 * these is closest to a buy?", not "what did they do today?".
 *
 * The fair value comes from the reader's own work: the DCF they saved for
 * the company (the scenario it was saved on, with bear and bull for the
 * range), or else the buy price they typed. Huntr does not put a number of
 * its own here.
 */

import { runDCF, type DCFScenarioKey, type DCFScenarioSet } from "@/lib/calculations";
import { MAX_PLAUSIBLE_UPSIDE, MIN_PLAUSIBLE_UPSIDE } from "@/lib/calculations/dcf-currency";

export interface FairValue {
  value: number;
  source: "dcf" | "target";
  /** The scenario the value comes from, for a DCF. */
  scenario?: DCFScenarioKey;
  /** Bear and bull, for a DCF whose three cases all value. */
  low?: number;
  high?: number;
}

/** A saved DCF, as much of it as a fair value needs. */
export interface SavedValuation {
  scenarios: DCFScenarioSet;
  activeScenario: DCFScenarioKey;
}

/** How far the price sits from the fair value: within this, above it, reads as close. */
export const NEAR_GAP = 0.1;

export type Stance = "buy" | "near" | "far" | "none";

export type IdeaSort = "closest" | "event" | "quality" | "today";

function valueOf(set: DCFScenarioSet, key: DCFScenarioKey): number | null {
  const inputs = set[key]?.inputs;
  if (!inputs) return null;
  try {
    // The stored price is zeroed; the intrinsic value does not depend on it.
    const v = runDCF(inputs).intrinsicValuePerShare;
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * The fair value to hold a price against: the saved DCF's, else the typed buy
 * price, else none. Given the price, a DCF that values the company out of all
 * proportion to it (statements in yen against a dollar ADR, most often) is
 * passed over, as the calculator itself refuses to show it.
 */
export function fairValueOf(
  saved: SavedValuation | null | undefined,
  target: number | null | undefined,
  price?: number | null
): FairValue | null {
  if (saved) {
    const value = valueOf(saved.scenarios, saved.activeScenario);
    const upside = value != null && price != null && price > 0 ? value / price - 1 : null;
    const plausible = upside == null || (upside <= MAX_PLAUSIBLE_UPSIDE && upside >= MIN_PLAUSIBLE_UPSIDE);
    if (value != null && plausible) {
      const low = valueOf(saved.scenarios, "bear");
      const high = valueOf(saved.scenarios, "bull");
      return {
        value,
        source: "dcf",
        scenario: saved.activeScenario,
        ...(low != null && high != null && low <= value && value <= high ? { low, high } : {}),
      };
    }
  }
  if (target != null && Number.isFinite(target) && target > 0) return { value: target, source: "target" };
  return null;
}

/** The price against the fair value: -0.12 is 12% below it, 0.04 is 4% above. */
export function gapOf(price: number | null | undefined, fair: FairValue | null): number | null {
  if (!fair || price == null || !Number.isFinite(price) || price <= 0) return null;
  return price / fair.value - 1;
}

export function stanceOf(gap: number | null): Stance {
  if (gap == null) return "none";
  if (gap <= 0) return "buy";
  if (gap <= NEAR_GAP) return "near";
  return "far";
}

/** Days from `now` to an ISO date (YYYY-MM-DD), or null when it is past or missing. */
export function daysUntil(date: string | null | undefined, now: number): number | null {
  if (!date) return null;
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const days = Math.round((t - today) / 86_400_000);
  return days >= 0 ? days : null;
}

export interface IdeaEvent {
  kind: "earnings" | "ex-dividend";
  days: number;
  date: string;
}

/** The nearer of the next earnings report and the next ex-dividend date. */
export function nextEvent(earnings: string | null | undefined, exDividend: string | null | undefined, now: number): IdeaEvent | null {
  const e = daysUntil(earnings, now);
  const d = daysUntil(exDividend, now);
  if (e == null && d == null) return null;
  if (d == null || (e != null && e <= d)) return { kind: "earnings", days: e!, date: earnings!.slice(0, 10) };
  return { kind: "ex-dividend", days: d, date: exDividend!.slice(0, 10) };
}

export interface IdeaRank {
  ticker: string;
  gap: number | null;
  event: IdeaEvent | null;
  quality: number | null;
  change: number | null;
}

const last = (v: number | null, dir: 1 | -1) => (v == null ? Infinity : dir * v);

/**
 * The order of the list. Closest to buy: furthest below its fair value
 * first, then those above it by how little; companies without a fair value
 * last. Next event: soonest first. Quality: best first. Today: biggest
 * fall first (where a price moves toward a buy). Ties keep the list order.
 */
export function sortIdeas<T extends IdeaRank>(ideas: readonly T[], sort: IdeaSort): T[] {
  const key = (i: T): number => {
    switch (sort) {
      case "closest":
        return last(i.gap, 1);
      case "event":
        return last(i.event?.days ?? null, 1);
      case "quality":
        return last(i.quality, -1);
      case "today":
        return last(i.change, 1);
    }
  };
  return ideas
    .map((idea, index) => ({ idea, index, k: key(idea) }))
    .sort((a, b) => (a.k === b.k ? a.index - b.index : a.k - b.k))
    .map((x) => x.idea);
}

export interface DaySummary {
  /** At or below their fair value. */
  inBuyZone: number;
  /** Within NEAR_GAP above it. */
  near: number;
  /** Earnings within the next seven days. */
  earningsThisWeek: number;
  /** The list's move today, equally weighted; null without any quote. */
  today: number | null;
  /** Companies without a fair value yet. */
  unvalued: number;
}

export function summarize(ideas: readonly IdeaRank[]): DaySummary {
  let inBuyZone = 0;
  let near = 0;
  let earningsThisWeek = 0;
  let unvalued = 0;
  let moved = 0;
  let sum = 0;
  for (const i of ideas) {
    const s = stanceOf(i.gap);
    if (s === "buy") inBuyZone++;
    else if (s === "near") near++;
    else if (s === "none") unvalued++;
    if (i.event?.kind === "earnings" && i.event.days <= 7) earningsThisWeek++;
    if (i.change != null && Number.isFinite(i.change)) {
      moved++;
      sum += i.change;
    }
  }
  return { inBuyZone, near, earningsThisWeek, today: moved > 0 ? sum / moved : null, unvalued };
}
