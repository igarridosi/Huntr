"use client";

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
];

export function StockTabs({ ticker }: StockTabsProps) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b border-wolf-border/50 -mx-1">
      {tabs.map((tab) => {
        const href = tab.href(ticker);
        const isActive = pathname === href;

        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg",
              isActive
                ? "text-sunset-orange"
                : "text-mist hover:text-snow-peak"
            )}
          >
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sunset-orange rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
