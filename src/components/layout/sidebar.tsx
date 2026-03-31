"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { Separator } from "@/components/ui/separator";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { KoFiSupport } from "@/components/ui/kofi-support";
import { useAllProfiles } from "@/hooks/use-stock-data";
import { getRecentSearches } from "@/lib/recent-searches";
import { useSupabase } from "@/providers/supabase-provider";

interface SidebarProps {
  onSearchClick?: () => void;
  overlay?: boolean;
  open?: boolean;
  onClose?: () => void;
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

export function Sidebar({
  onSearchClick,
  overlay = false,
  open = true,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { supabase } = useSupabase();
  const { data: profiles = [] } = useAllProfiles();
  const recentSearches = getRecentSearches();

  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((profile) => [profile.ticker, profile])),
    [profiles]
  );

  useEffect(() => {
    for (const ticker of recentSearches.slice(0, 6)) {
      router.prefetch(ROUTES.SYMBOL(ticker));
    }
  }, [recentSearches, router]);

  if (!open) return null;

  return (
    <>
      {overlay ? (
        <button
          type="button"
          aria-label="Close desktop sidebar overlay"
          onClick={onClose}
          className="hidden lg:block fixed inset-0 z-40 bg-wolf-black/45 backdrop-blur-[1px]"
        />
      ) : null}

      <aside
        className={cn(
          "hidden lg:flex flex-col w-64 h-screen bg-wolf-surface border-r border-wolf-border/50 fixed left-0 top-0",
          overlay ? "z-50 shadow-2xl" : "z-40"
        )}
      >
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
        {overlay ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="ml-auto p-1.5 rounded-md text-mist hover:text-snow-peak hover:bg-wolf-black/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
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
        <Link
          href={ROUTES.APP_SETTINGS}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-mist hover:text-snow-peak hover:bg-wolf-black/30 transition-all duration-200 cursor-pointer"
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            router.push(ROUTES.LOGIN);
          }}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-mist hover:text-bearish hover:bg-bearish/10 transition-all duration-200 cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </button>

        <div className="px-3 pt-2 pb-1 flex flex-col items-start">
          <KoFiSupport text="Support Huntr on Ko-fi" position="above" />
        </div>
      </div>
      </aside>
    </>
  );
}
