"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Lightbulb,
  Search,
  Star,
  CalendarClock,
  MessageSquareText,
  Calculator,
  BriefcaseBusiness,
  Settings,
  LogOut,
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { Separator } from "@/components/ui/separator";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { useAllProfiles } from "@/hooks/use-stock-data";
import { getRecentSearches } from "@/lib/recent-searches";

interface SidebarProps {
  onSearchClick?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchExact?: boolean;
}

const mainNav: NavItem[] = [
  {
    label: "Insights",
    href: ROUTES.APP_INSIGHTS,
    icon: Lightbulb,
    matchExact: true,
  },
  {
    label: "Watchlists",
    href: ROUTES.APP_WATCHLISTS,
    icon: Star,
  },
  {
    label: "Earnings",
    href: ROUTES.APP_EARNINGS,
    icon: CalendarClock,
  },
  {
    label: "Transcripts",
    href: ROUTES.APP_TRANSCRIPTS,
    icon: MessageSquareText,
  },
  {
    label: "DCF Calculator",
    href: ROUTES.APP_DCF_CALCULATOR,
    icon: Calculator,
  },
  {
    label: "Portfolios",
    href: ROUTES.APP_PORTFOLIOS,
    icon: BriefcaseBusiness,
  },
];

export function Sidebar({ onSearchClick }: SidebarProps) {
  const pathname = usePathname();
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { data: profiles = [] } = useAllProfiles();

  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((profile) => [profile.ticker, profile])),
    [profiles]
  );

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, [pathname]);

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen bg-wolf-surface border-r border-wolf-border/50 fixed left-0 top-0 z-40">
      {/* ---- Logo / Brand ---- */}
      <div className="flex items-center gap-3 px-6 h-16 shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sunset-orange/15">
          <Crosshair className="w-5 h-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-base font-bold text-snow-peak tracking-tight">
            HUNTR
          </h1>
          <p className="text-[10px] text-mist/60 font-mono uppercase tracking-widest">
            Wolf of Value St.
          </p>
        </div>
      </div>

      <Separator className="opacity-50" />

      {/* ---- Search Trigger ---- */}
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={onSearchClick}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm",
            "text-mist hover:text-snow-peak hover:bg-wolf-black/50",
            "border border-wolf-border/50 transition-all duration-200",
            "cursor-pointer"
          )}
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">Search tickers...</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-mist/60 bg-wolf-black/50 rounded border border-wolf-border/50">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ---- Main Navigation ---- */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        <p className="px-3 text-[10px] font-semibold text-mist/50 uppercase tracking-widest mb-2">
          Platform
        </p>
        {mainNav.map((item) => {
          const isActive = item.matchExact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sunset-orange/10 text-sunset-orange"
                  : "text-mist hover:text-snow-peak hover:bg-wolf-black/30"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-4 space-y-1">
          <p className="px-3 text-[10px] font-semibold text-mist/50 uppercase tracking-widest mb-2">
            Recent Searches
          </p>
          <div className="space-y-0.5">
            {recentSearches.length > 0 ? (
              recentSearches.map((ticker) => (
                <Link
                  key={ticker}
                  href={ROUTES.SYMBOL(ticker)}
                  className={cn(
                    "group flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all duration-200",
                    "text-mist hover:text-snow-peak hover:bg-wolf-black/30"
                  )}
                >
                  <TickerLogo
                    ticker={ticker}
                    src={profileMap[ticker]?.logo_url}
                    className="h-4 w-4"
                    imageClassName="rounded-[4px]"
                    fallbackClassName="rounded-[4px] text-[9px]"
                  />
                  <span className="font-mono text-xs font-semibold tracking-wide">
                    {ticker}
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-3 py-1 text-xs text-mist/50">No recent symbols</p>
            )}
          </div>
        </div>
      </nav>

      {/* ---- Bottom Section ---- */}
      <div className="px-3 py-3 space-y-1 shrink-0">
        <Separator className="opacity-50 mb-3" />
        <button
          type="button"
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-mist hover:text-snow-peak hover:bg-wolf-black/30 transition-all duration-200 cursor-pointer"
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </button>
        <button
          type="button"
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-mist hover:text-bearish hover:bg-bearish/10 transition-all duration-200 cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
