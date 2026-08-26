"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const [underline, setUnderline] = useState({ x: 0, width: 0, ready: false });
  const [animated, setAnimated] = useState(false);

  const measure = useCallback(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;

    setUnderline((prev) =>
      Math.abs(prev.x - active.offsetLeft) < 0.5 &&
      Math.abs(prev.width - active.offsetWidth) < 0.5 &&
      prev.ready
        ? prev
        : { x: active.offsetLeft, width: active.offsetWidth, ready: true }
    );
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, pathname]);

  // First placement must not travel — an underline sliding in from x=0 on load
  // is motion that means nothing. Transitions arm one frame later.
  useEffect(() => {
    if (!underline.ready || animated) return;
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, [underline.ready, animated]);

  useEffect(() => {
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (observer && scrollerRef.current) observer.observe(scrollerRef.current);
    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Five tabs never fit a phone. They scroll instead of overflowing the page,
  // which means the active one can start off-screen — so bring it into view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;

    scroller.scrollTo({
      left: Math.max(0, active.offsetLeft - scroller.clientWidth / 2 + active.offsetWidth / 2),
      behavior: "instant" as ScrollBehavior,
    });
  }, [pathname]);

  return (
    <div className="relative">
      {/* A soft edge rather than a hard rule under the whole row. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-wolf-border/60 to-transparent"
      />
      <div
        ref={scrollerRef}
        className={cn(
          "relative flex items-center gap-1 overflow-x-auto overscroll-x-contain",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          "[mask-image:linear-gradient(to_right,transparent_0,black_12px,black_calc(100%-20px),transparent_100%)] sm:[mask-image:none]"
        )}
      >
        {/* One underline travels between tabs — a highlight that simply swaps
            reads as two events instead of one movement. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-sunset-orange",
            animated &&
              "transition-[transform,width] duration-[350ms] ease-settle motion-reduce:transition-none",
            underline.ready ? "opacity-100" : "opacity-0"
          )}
          style={{
            transform: `translate3d(${underline.x + 8}px, 0, 0)`,
            width: `${Math.max(0, underline.width - 16)}px`,
          }}
        />

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
                "relative shrink-0 whitespace-nowrap rounded-t-lg px-3.5 py-3 text-[13.5px] font-medium",
                "transition-[color,transform] duration-150 ease-out active:scale-[0.97]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
                "motion-reduce:transition-none motion-reduce:active:scale-100",
                "sm:px-4 sm:py-2.5",
                isActive ? "text-sunset-orange" : "text-mist hover:text-snow-peak"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
