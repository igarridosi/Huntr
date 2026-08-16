"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

interface StockTabsProps {
  ticker: string;
}

const tabs = [
  { label: "Overview", href: (t: string) => ROUTES.SYMBOL(t) },
  { label: "Financials", href: (t: string) => ROUTES.SYMBOL_FINANCIALS(t) },
  { label: "Valuation", href: (t: string) => ROUTES.SYMBOL_VALUATION(t) },
  { label: "Dividends", href: (t: string) => ROUTES.SYMBOL_DIVIDENDS(t) },
  { label: "Earnings", href: (t: string) => ROUTES.SYMBOL_EARNINGS(t) },
];

export function StockTabs({ ticker }: StockTabsProps) {
  const pathname = usePathname();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // Five tabs never fit a phone. They scroll instead of overflowing the page,
  // which means the active one can start off-screen — so bring it into view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;

    const target =
      active.offsetLeft - scroller.clientWidth / 2 + active.offsetWidth / 2;

    scroller.scrollTo({
      left: Math.max(0, target),
      behavior: "instant" as ScrollBehavior,
    });
  }, [pathname]);

  return (
    <div className="relative border-b border-wolf-border/50">
      <div
        ref={scrollerRef}
        className={cn(
          "flex items-center gap-1 overflow-x-auto overscroll-x-contain",
          // Native scrollbar would sit on top of the underline
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          // Fade the cut edge so it reads as "more to the side", not as clipped
          "[mask-image:linear-gradient(to_right,transparent_0,black_12px,black_calc(100%-20px),transparent_100%)] sm:[mask-image:none]"
        )}
      >
        {tabs.map((tab) => {
          const href = tab.href(ticker);
          const isActive = pathname === href;

          return (
            <Link
              key={tab.label}
              href={href}
              ref={isActive ? activeRef : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative shrink-0 whitespace-nowrap rounded-t-lg px-3.5 py-3 text-sm font-medium transition-colors sm:px-4 sm:py-2.5",
                isActive ? "text-sunset-orange" : "text-mist hover:text-snow-peak"
              )}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-sunset-orange" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
