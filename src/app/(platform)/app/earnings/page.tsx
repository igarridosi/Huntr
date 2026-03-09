"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Filter,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { useAllProfiles, useAllQuotes } from "@/hooks/use-stock-data";
import { useWatchlist } from "@/hooks/use-watchlist";
import type { StockProfile, StockQuote } from "@/types/stock";

type CapFilter = "all" | "mega" | "large" | "mid" | "small";

type EarningsTiming = "Before Open" | "After Close";

interface EarningsItem {
  ticker: string;
  date: Date;
  profile: StockProfile | null;
  quote: StockQuote;
  timing: EarningsTiming;
}

interface EarningsSection {
  key: string;
  label: EarningsTiming;
  icon: typeof Sun;
  items: EarningsItem[];
}

function getWeekStart(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function capMatches(filter: CapFilter, marketCap: number): boolean {
  if (filter === "all") return true;
  if (filter === "mega") return marketCap >= 200_000_000_000;
  if (filter === "large") return marketCap >= 10_000_000_000 && marketCap < 200_000_000_000;
  if (filter === "mid") return marketCap >= 2_000_000_000 && marketCap < 10_000_000_000;
  return marketCap < 2_000_000_000;
}

export default function EarningsPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [capFilter, setCapFilter] = useState<CapFilter>("all");
  const [watchlistFilterId, setWatchlistFilterId] = useState("all");

  const { data: quotes = [], isLoading: quotesLoading } = useAllQuotes();
  const { data: profiles = [], isLoading: profilesLoading } = useAllProfiles();
  const { lists } = useWatchlist();

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.ticker.toUpperCase(), profile])),
    [profiles]
  );

  const watchlistTickerSet = useMemo(() => {
    if (watchlistFilterId === "all") return null;
    const list = lists.find((entry) => entry.id === watchlistFilterId);
    if (!list) return null;
    return new Set(list.items.map((item) => item.ticker.toUpperCase()));
  }, [lists, watchlistFilterId]);

  const baseWeekStart = useMemo(() => {
    const base = getWeekStart(new Date());
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  const allEarningsItems = useMemo(() => {
    return quotes
      .filter((quote) => !!quote.next_earnings_date)
      .map((quote) => {
        const date = new Date(`${quote.next_earnings_date}T00:00:00`);
        return {
          ticker: quote.ticker,
          date,
          profile: profileMap.get(quote.ticker.toUpperCase()) ?? null,
          quote,
          timing:
            quote.earnings_timing === "Before Open" || quote.earnings_timing === "After Close"
              ? quote.earnings_timing
              : null,
        };
      })
      .filter((item): item is EarningsItem => item.timing !== null)
      .filter((item) => item.date.getTime() >= Date.now() - 24 * 60 * 60 * 1000)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [quotes, profileMap]);

  const weekStart = useMemo(() => {
    if (weekOffset !== 0) return baseWeekStart;
    const currentWeekEnd = addDays(baseWeekStart, 5);
    const hasCurrentWeekItems = allEarningsItems.some(
      (item) => item.date >= baseWeekStart && item.date < currentWeekEnd
    );
    if (hasCurrentWeekItems) return baseWeekStart;

    const nextItem = allEarningsItems[0];
    if (!nextItem) return baseWeekStart;
    return getWeekStart(nextItem.date);
  }, [weekOffset, baseWeekStart, allEarningsItems]);

  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );

  const earningsItems = useMemo(() => {
    const weekEnd = addDays(weekStart, 5);
    return allEarningsItems
      .filter((item) => item.date >= weekStart && item.date < weekEnd)
      .filter((item) => {
        const term = search.trim().toLowerCase();
        if (!term) return true;
        return (
          item.ticker.toLowerCase().includes(term) ||
          (item.profile?.name ?? "").toLowerCase().includes(term)
        );
      })
      .filter((item) => capMatches(capFilter, item.quote.market_cap))
      .filter((item) => {
        if (!watchlistTickerSet) return true;
        return watchlistTickerSet.has(item.ticker.toUpperCase());
      })
      .sort((a, b) => b.quote.market_cap - a.quote.market_cap);
  }, [allEarningsItems, weekStart, search, capFilter, watchlistTickerSet]);

  const dayColumns = useMemo(
    () =>
      weekDays.map((day) => ({
        day,
        groups: {
          beforeOpen: earningsItems.filter(
            (item) => isSameDay(item.date, day) && item.timing === "Before Open"
          ),
          afterClose: earningsItems.filter(
            (item) => isSameDay(item.date, day) && item.timing === "After Close"
          ),
        },
      })),
    [weekDays, earningsItems]
  );

  const isLoading = quotesLoading || profilesLoading;

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
          <CalendarClock className="w-5 h-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">Earnings</h1>
          <p className="text-xs text-mist mt-0.5">Weekly earnings calendar, curated for fast scanning</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-wolf-border/30 p-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" onClick={() => setWeekOffset((value) => value - 1)} aria-label="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} className="text-xs">Today</Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setWeekOffset((value) => value + 1)} aria-label="Next week">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="ml-1">
                <p className="text-sm font-semibold text-snow-peak">Earnings This Week</p>
                <p className="text-[11px] text-mist">
                  {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" - "}
                  {addDays(weekStart, 4).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-mist/70" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search ticker or company"
                  className="h-9 w-[220px] pl-8 text-xs"
                />
              </div>

              <select
                value={capFilter}
                onChange={(event) => setCapFilter(event.target.value as CapFilter)}
                className="h-9 rounded-md border border-wolf-border/40 bg-wolf-black/40 px-3 text-xs text-snow-peak"
                aria-label="Market cap filter"
              >
                <option value="all">Market Cap: All</option>
                <option value="mega">Mega (200B+)</option>
                <option value="large">Large (10B-200B)</option>
                <option value="mid">Mid (2B-10B)</option>
                <option value="small">Small (&lt;2B)</option>
              </select>

              <select
                value={watchlistFilterId}
                onChange={(event) => setWatchlistFilterId(event.target.value)}
                className="h-9 rounded-md border border-wolf-border/40 bg-wolf-black/40 px-3 text-xs text-snow-peak"
                aria-label="Watchlist filter"
              >
                <option value="all">Filter by Watchlist: All</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 p-3">
            <div className="hidden xl:grid xl:col-span-5 grid-cols-5 rounded-md border border-wolf-border/40 bg-wolf-black/35 overflow-hidden">
              {weekDays.map((day) => (
                <div key={`calendar-${day.toISOString()}`} className="px-3 py-2 border-r border-wolf-border/35 last:border-r-0 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-mist">
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <div className="mt-1 flex justify-center">
                    <span
                      className={
                        isSameDay(day, today)
                          ? "h-6 w-6 rounded-full bg-sky-attention bg-sunset-orange text-xs font-semibold inline-flex items-center justify-center"
                          : "text-xs font-semibold text-snow-peak"
                      }
                    >
                      {day.toLocaleDateString("en-US", { day: "numeric" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {dayColumns.map(({ day, groups }) => {
              const sections: EarningsSection[] = [
                { key: "before-open", label: "Before Open", icon: Sun, items: groups.beforeOpen },
                { key: "after-close", label: "After Close", icon: Moon, items: groups.afterClose },
              ];

              return (
                <div key={day.toISOString()} className="rounded-lg border border-wolf-border/40 bg-wolf-black/80 overflow-hidden">
                  <div className="border-b border-wolf-border/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="xl:hidden text-xs uppercase tracking-wide text-mist">
                          {day.toLocaleDateString("en-US", { weekday: "short" })}
                        </p>
                        <p className="xl:hidden text-sm font-semibold text-snow-peak">
                          {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 space-y-2 min-h-[520px]">
                    {isLoading ? (
                      <div className="rounded-md border border-wolf-border/40 bg-wolf-black/35 p-3">
                        <p className="text-xs text-mist/80">Loading...</p>
                      </div>
                    ) : (
                      sections.map((section) => (
                        <div key={section.key} className="rounded-md border border-wolf-border/40 bg-wolf-black/35 p-2.5">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-medium text-snow-peak inline-flex items-center gap-1.5">
                              <section.icon className="h-3.5 w-3.5 text-mist" />
                              {section.label}
                            </p>
                            <Badge variant="secondary" className="text-[10px] h-5">{section.items.length}</Badge>
                          </div>

                          {section.items.length === 0 ? (
                            <p className="text-xs text-mist/70">No reports</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
                              {section.items.slice(0, 16).map((item) => (
                                <Link
                                  href={`/symbol/${item.ticker.toUpperCase()}`}
                                  key={`${item.ticker}-${item.date.toISOString()}-${section.key}`}
                                  className="rounded-md border border-wolf-border/45 bg-wolf-surface/90 p-2 min-h-[74px] sm:min-h-[76px] flex justify-center text-center hover:border-sunset-orange/30 transition-colors"
                                  aria-label={`Open ${item.ticker} details`}
                                >
                                  <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                                    <TickerLogo
                                      ticker={item.ticker}
                                      src={item.profile?.logo_url}
                                      className="h-8 w-8 sm:h-9 sm:w-9"
                                      imageClassName="rounded-[6px]"
                                      fallbackClassName="rounded-[6px] text-[10px]"
                                    />
                                    <div className="w-full">
                                      <p className="text-[11px] sm:text-xs font-semibold text-snow-peak leading-tight">{item.ticker}</p>
                                    </div>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-wolf-border/30 px-3 py-2 flex items-center justify-between">
            <p className="text-xs text-mist inline-flex items-center gap-1.5">
              <Filter className="h-3 w-3" /> Showing {earningsItems.length} earnings events this week
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
