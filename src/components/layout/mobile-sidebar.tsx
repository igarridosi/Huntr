"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  Lightbulb,
  Star,
  CalendarClock,
  MessageSquareText,
  Calculator,
  BriefcaseBusiness,
  Settings,
  LogOut,
  X,
  Crosshair,
  Search,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { Separator } from "@/components/ui/separator";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { useAllProfiles } from "@/hooks/use-stock-data";
import { getRecentSearches } from "@/lib/recent-searches";

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
  onSearchClick?: () => void;
}

const navItems = [
  { label: "Insights", href: ROUTES.APP_INSIGHTS, icon: Lightbulb },
  { label: "Watchlists", href: ROUTES.APP_WATCHLISTS, icon: Star },
  { label: "Earnings", href: ROUTES.APP_EARNINGS, icon: CalendarClock },
  { label: "Transcripts", href: ROUTES.APP_TRANSCRIPTS, icon: MessageSquareText },
  { label: "DCF Calculator", href: ROUTES.APP_DCF_CALCULATOR, icon: Calculator },
  { label: "Portfolios", href: ROUTES.APP_PORTFOLIOS, icon: BriefcaseBusiness },
];

export function MobileSidebar({ open, onClose, onSearchClick }: MobileSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: profiles = [] } = useAllProfiles();
  const recentSearches = getRecentSearches();

  // Close on route change
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    for (const ticker of recentSearches.slice(0, 6)) {
      router.prefetch(ROUTES.SYMBOL(ticker));
    }
  }, [open, recentSearches, router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-wolf-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-wolf-surface border-r border-wolf-border/50 flex flex-col animate-in slide-in-from-left">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 shrink-0">
          <div className="flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-sunset-orange" />
            <span className="text-base font-bold tracking-tight">HUNTR</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            title="Close sidebar"
            className="p-1.5 rounded-md text-mist hover:text-snow-peak hover:bg-wolf-black/30 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <Separator className="opacity-50" />

        {/* Search */}
        <div className="px-3 py-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSearchClick?.();
            }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-mist hover:text-snow-peak hover:bg-wolf-black/30 border border-wolf-border/50 transition-all cursor-pointer"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>Search tickers...</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-1 overflow-y-auto">
          <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
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
          </div>

          <div className="pt-4 space-y-1">
            <p className="px-3 text-[10px] font-semibold text-mist/50 uppercase tracking-widest mb-2">
              Recent Searches
            </p>
            {recentSearches.length > 0 ? (
              recentSearches.map((ticker) => {
                const profile = profiles.find((item) => item.ticker === ticker);
                return (
                  <Link
                    key={ticker}
                    href={ROUTES.SYMBOL(ticker)}
                    className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-mist hover:text-snow-peak hover:bg-wolf-black/30 transition-all"
                  >
                    <TickerLogo
                      ticker={ticker}
                      src={profile?.logo_url}
                      className="h-4 w-4"
                      imageClassName="rounded-[4px]"
                      fallbackClassName="rounded-[4px] text-[9px]"
                    />
                    <span className="font-mono text-xs font-semibold tracking-wide">
                      {ticker}
                    </span>
                  </Link>
                );
              })
            ) : (
              <p className="px-3 py-1 text-xs text-mist/50">No recent symbols</p>
            )}
          </div>
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3 space-y-1 shrink-0">
          <Separator className="opacity-50 mb-3" />
          <button
            type="button"
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-mist hover:text-snow-peak hover:bg-wolf-black/30 transition-all cursor-pointer"
          >
            <Settings className="w-4 h-4 shrink-0" />
            Settings
          </button>
          <button
            type="button"
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-mist hover:text-bearish hover:bg-bearish/10 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
