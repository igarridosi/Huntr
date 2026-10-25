"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Clock3, Star, TrendingUp, Users } from "lucide-react";
import { MaterialPanel } from "@/components/ui/material-panel";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { useWatchlistStore } from "@/hooks/use-watchlist";
import { CLUSTER_DAYS, CLUSTER_MIN } from "@/lib/insiders/activity";
import { ROUTES } from "@/lib/constants";

/** Shortcuts for a first look: large, widely held US companies, each with a long Form 4 record. */
const OFTEN_FOLLOWED = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "V", "COST"];

/**
 * Tracks before a company is chosen. Nothing here reads the SEC: the
 * reader's own companies (the watchlist, the ones opened before) and a few
 * well-known ones are one tap from their record, and a short guide says how
 * to read it. A company's filings load only once it is opened.
 */
export function TracksStart({ onOpen, recent }: { onOpen: (ticker: string) => void; recent: readonly string[] }) {
  // The lists only: their quotes are not needed here, and asking for them held the page back.
  const { data: store, isPending } = useWatchlistStore();
  const watched = useMemo(
    () => [...new Set((store?.lists ?? []).flatMap((l) => l.items.map((i) => i.ticker.toUpperCase())))].slice(0, 24),
    [store]
  );
  // Only the ones not already one tap away above, once the lists are known
  // (shown before, some would vanish as the watchlist arrived).
  const suggested = isPending ? [] : OFTEN_FOLLOWED.filter((t) => !watched.includes(t) && !recent.includes(t));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <MaterialPanel className="flex flex-col gap-6 lg:col-span-2">
        <div>
          <h2 className="text-[0.95rem] font-semibold tracking-[-0.01em] text-snow-peak">Pick a company</h2>
          <p className="mt-1 text-xs text-mist">Search above, or open one of these: its insiders&apos; last two years load in a few seconds.</p>
        </div>

        {recent.length > 0 ? (
          <Group icon={<Clock3 className="h-3.5 w-3.5" />} title="Opened recently">
            {recent.map((t, i) => (
              <Chip key={t} ticker={t} index={i} onOpen={onOpen} />
            ))}
          </Group>
        ) : null}

        <Group icon={<Star className="h-3.5 w-3.5" />} title="From your watchlists">
          {isPending ? (
            Array.from({ length: 6 }, (_, i) => <span key={i} className="h-9 w-24 animate-pulse rounded-xl bg-snow-peak/[0.04]" />)
          ) : watched.length > 0 ? (
            watched.map((t, i) => <Chip key={t} ticker={t} index={i} onOpen={onOpen} />)
          ) : (
            <p className="text-xs text-mist">
              Companies you add to a{" "}
              <Link href={ROUTES.APP_WATCHLISTS} className="text-snow-peak underline decoration-mist/40 underline-offset-2 hover:text-sunset-orange">
                watchlist
              </Link>{" "}
              show up here, one tap from their insiders.
            </p>
          )}
        </Group>

        {suggested.length > 0 ? (
          <Group icon={<TrendingUp className="h-3.5 w-3.5" />} title="Often followed">
            {suggested.map((t, i) => (
              <Chip key={t} ticker={t} index={i} onOpen={onOpen} />
            ))}
          </Group>
        ) : null}
      </MaterialPanel>

      <MaterialPanel className="lg:col-span-1">
        <h2 className="text-[0.95rem] font-semibold tracking-[-0.01em] text-snow-peak">How to read it</h2>
        <p className="mt-1 text-xs text-mist">Officers and directors report their trades on Form 4 within two business days.</p>
        <ul className="mt-4 space-y-3">
          <Guide
            icon={<ArrowUpRight className="h-4 w-4" />}
            tone="bg-bullish/12 text-bullish"
            title="Open-market buys"
            text="An insider spending their own money at the market price. The clearest signal on file: there are many reasons to sell, few to buy."
          />
          <Guide
            icon={<ArrowDownRight className="h-4 w-4" />}
            tone="bg-bearish/12 text-bearish"
            title="Sales"
            text="Often planned in advance (10b5-1) or for taxes and diversification. Telling when they are large, unplanned or by several insiders at once."
          />
          <Guide
            icon={<Users className="h-4 w-4" />}
            tone="bg-sunset-orange/12 text-sunset-orange"
            title="Cluster buying"
            text={`${CLUSTER_MIN} or more insiders buying within ${CLUSTER_DAYS} days. Huntr flags it when it happens.`}
          />
        </ul>
      </MaterialPanel>
    </div>
  );
}

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-mist">
        {icon}
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Chip({ ticker, index, onOpen }: { ticker: string; index: number; onOpen: (ticker: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ticker)}
      className="insight-enter group inline-flex h-9 items-center gap-2 rounded-xl bg-snow-peak/[0.03] pl-1.5 pr-3 ring-1 ring-inset ring-wolf-border/60 transition-[background-color,box-shadow,transform] duration-150 hover:bg-snow-peak/[0.06] hover:ring-sunset-orange/40 active:scale-[0.97]"
      style={{ "--enter-delay": `${Math.min(index * 25, 300)}ms` } as React.CSSProperties}
    >
      <TickerLogo ticker={ticker} className="h-6 w-6 rounded-md" />
      <span className="font-mono text-[12.5px] font-semibold text-snow-peak">{ticker}</span>
    </button>
  );
}

function Guide({ icon, tone, title, text }: { icon: ReactNode; tone: string; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
      <span>
        <span className="block text-[13px] font-medium text-snow-peak">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-mist">{text}</span>
      </span>
    </li>
  );
}
