"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInsiderActivity } from "@/hooks/use-stock-data";
import { labelOf } from "@/lib/insiders/activity";
import { ROUTES } from "@/lib/constants";
import { cn, formatCompactNumber, formatCurrency } from "@/lib/utils";

/**
 * The insider record in a card, on the ticker page.
 *
 * It asks for nothing until it scrolls into view: a company nobody has
 * opened yet costs a burst of SEC requests, and a reader who never gets
 * this far down the page should not pay for it.
 */
export function InsiderCard({ ticker }: { ticker: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(node);
    return () => io.disconnect();
  }, [seen]);

  const { data, isLoading } = useInsiderActivity(ticker, seen);
  const market = (data?.rows ?? []).filter((r) => r.kind === "buy" || r.kind === "sell").slice(0, 3);
  const s = data?.summary;

  return (
    <Card ref={ref} className="insight-enter">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-[10px] font-semibold uppercase tracking-[0.11em] text-mist/85">Insider activity · 12 months</CardTitle>
        <Link
          href={`${ROUTES.APP_TRACKS}?tab=insiders&ticker=${encodeURIComponent(ticker)}`}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-sunset-orange transition-colors hover:text-golden-hour"
        >
          Every filing in Tracks <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {!seen || isLoading ? (
          <p className="flex items-center gap-2 text-xs text-mist">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the Form 4s on EDGAR…
          </p>
        ) : !data || !s ? (
          <p className="text-xs text-mist">No SEC insider record for {ticker}.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs tabular-nums">
              <span>
                <span className="text-mist">Open-market buys </span>
                <span className={s.buys.count ? "text-bullish" : "text-mist/60"}>
                  {s.buys.count}{s.buys.value > 0 ? `, ${formatCurrency(s.buys.value, { compact: true, decimals: 1 })}` : ""}
                </span>
              </span>
              <span>
                <span className="text-mist">Open-market sells </span>
                <span className={s.sells.count ? "text-bearish" : "text-mist/60"}>
                  {s.sells.count}{s.sells.value > 0 ? `, ${formatCurrency(s.sells.value, { compact: true, decimals: 1 })}` : ""}
                </span>
              </span>
              <span className="text-mist">
                Plan sales {s.planSells.count} · plan buys {s.planBuys.count}
              </span>
              {s.cluster ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-bullish/10 px-2 py-1 font-sans font-medium text-bullish ring-1 ring-inset ring-bullish/25">
                  <Users className="h-3 w-3" /> {s.cluster.insiders.length} insiders buying within 90 days
                </span>
              ) : null}
            </div>

            {market.length === 0 ? (
              <p className="text-xs text-mist">No open-market trades in the filings read. Only routine grants, exercises and tax withholding.</p>
            ) : (
              <ul className="divide-y divide-wolf-border/30">
                {market.map((r, i) => (
                  <li key={`${r.accession}-${i}`} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate text-snow-peak">{r.owner}</span>
                      <span className="block truncate text-[11px] text-mist">
                        {r.date} · {labelOf(r.kind)}{r.plan ? " · 10b5-1 plan" : ""}
                      </span>
                    </span>
                    <span className={cn("shrink-0 text-right font-mono tabular-nums", r.kind === "buy" ? "text-bullish" : "text-bearish")}>
                      {r.kind === "buy" ? "+" : "−"}{formatCompactNumber(r.shares)}
                      <span className="block text-[11px] text-mist">{r.value !== null ? formatCurrency(r.value, { compact: true, decimals: 1 }) : "no price"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
