"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Lightbulb,
  Star,
  CalendarClock,
  MessageSquareText,
  Calculator,
  BriefcaseBusiness,
  Settings,
  LogOut,
  LogIn,
  UserPlus,
  X,
  Search,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn, enterDelay } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { Separator } from "@/components/ui/separator";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { KoFiSupport } from "@/components/ui/kofi-support";
import { useAllProfiles } from "@/hooks/use-stock-data";
import { getRecentSearches } from "@/lib/recent-searches";
import { useSupabase } from "@/providers/supabase-provider";

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
  const { supabase, user } = useSupabase();
  const { data: profiles = [] } = useAllProfiles();
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

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
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-wolf-border/40 px-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex items-center justify-center rounded-lg bg-[#162225] p-1">
              <Image
                src="/logo/HunterLogoCut-removebg.png"
                alt="Huntr"
                width={40}
                height={30}
                className="h-auto w-10 object-contain"
                priority
              />
            </div>
            <span className="truncate text-base font-bold tracking-tight">HUNTR</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            title="Close sidebar"
            className="cursor-pointer rounded-lg p-1.5 text-mist transition-[background-color,color,transform] duration-150 ease-out hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSearchClick?.();
            }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg bg-snow-peak/[0.03] px-3 py-2.5 text-sm text-mist ring-1 ring-inset ring-wolf-border/45 transition-[background-color,color,box-shadow,transform] duration-150 ease-out hover:bg-snow-peak/[0.06] hover:text-snow-peak hover:ring-wolf-border/70 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>Search tickers...</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="scroll-quiet flex-1 overflow-y-auto px-3 py-1">
          <div className="space-y-1">
          {navItems.map((item, itemIndex) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                style={enterDelay(itemIndex * 25)}
                className={cn(
                  "insight-enter relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  "transition-[background-color,color,transform] duration-150 ease-out",
                  "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
                  isActive
                    ? "bg-snow-peak/[0.05] text-snow-peak"
                    : "text-mist hover:bg-snow-peak/[0.04] hover:text-snow-peak"
                )}
              >
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-sunset-orange"
                  />
                ) : null}
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors duration-150",
                    isActive ? "text-sunset-orange" : "text-mist/80"
                  )}
                />
                {item.label}
              </Link>
            );
          })}
          </div>

          <div className="pt-4 space-y-1">
            <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.09em] text-mist/50">
              Recent Searches
            </p>
            {recentSearches.length > 0 ? (
              recentSearches.map((ticker) => {
                const profile = profiles.find((item) => item.ticker === ticker);
                return (
                  <Link
                    key={ticker}
                    href={ROUTES.SYMBOL(ticker)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-mist transition-[background-color,color,transform] duration-150 ease-out hover:bg-snow-peak/[0.04] hover:text-snow-peak active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
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
          {user ? (
            <>
              <Link
                href={ROUTES.APP_SETTINGS}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-mist transition-[background-color,color,transform] duration-150 ease-out hover:bg-snow-peak/[0.04] hover:text-snow-peak active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                onClick={onClose}
              >
                <Settings className="w-4 h-4 shrink-0" />
                Settings
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  onClose();
                  router.push(ROUTES.LOGIN);
                }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-mist hover:text-bearish hover:bg-bearish/10 transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link
                href={ROUTES.SIGNUP}
                onClick={onClose}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-wolf-black bg-sunset-orange hover:bg-sunset-orange/90 transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                Create free account
              </Link>
              <Link
                href={ROUTES.LOGIN}
                onClick={onClose}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-mist transition-[background-color,color,transform] duration-150 ease-out hover:bg-snow-peak/[0.04] hover:text-snow-peak active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                Log in
              </Link>
            </>
          )}

          <div className="px-3 pt-2 pb-1">
            <KoFiSupport text="Support Huntr" />
          </div>
        </div>
      </div>
    </div>
  );
}
