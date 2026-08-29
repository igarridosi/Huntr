"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Lightbulb,
  Search,
  Star,
  CalendarClock,
  MessageSquareText,
  Calculator,
  BriefcaseBusiness,
  SlidersHorizontal,
  Settings,
  LogOut,
  LogIn,
  UserPlus,
  X,
} from "lucide-react";
import { cn, enterDelay } from "@/lib/utils";
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
    label: "Screener",
    href: ROUTES.APP_SCREENER,
    icon: SlidersHorizontal,
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
  const { supabase, user } = useSupabase();
  const { data: profiles = [] } = useAllProfiles();
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

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
          "fixed left-0 top-0 hidden h-screen w-64 flex-col bg-wolf-surface lg:flex",
          // A hairline edge rather than a border: the panel is already a
          // different surface from the page, so the divider only has to mark
          // where one ends.
          "after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-wolf-border/40 after:content-['']",
          overlay ? "z-50 shadow-2xl" : "z-40"
        )}
      >
      {/* ---- Logo / Brand ---- */}
      {/* The height matches the topbar so the two dividers line up across the
          page, which means the room this block needs has to come from the
          sides rather than from growing downwards. The wordmark was competing
          with a 44px logo and a close button inside 256px, so the tagline wrapped
          onto a second line and pushed the whole group out of a 56px header -
          which is what made it look crowded. A smaller mark, a wider gutter and
          a tagline that truncates instead of wrapping give it back its air. */}
      <div className="flex h-14 shrink-0 items-center gap-3.5 border-b border-wolf-border/40 px-5">
        {/* Fixed dark container keeps the white wolf visible in both themes */}
        <div className="flex shrink-0 items-center justify-center rounded-lg bg-[#162225] p-1">
          <Image
            src="/logo/HunterLogoCut-removebg.png"
            alt="Huntr"
            width={38}
            height={29}
            className="h-auto w-[38px] object-contain"
            priority
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold leading-tight tracking-tight text-snow-peak">
            HUNTR
          </h1>
          <p className="truncate font-mono text-[9px] uppercase leading-tight tracking-[0.14em] text-mist/50">
            Wolf of Value St.
          </p>
        </div>
        {overlay ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="-mr-1.5 ml-auto shrink-0 rounded-lg p-1.5 text-mist transition-[background-color,color,transform] duration-150 ease-out hover:bg-snow-peak/[0.06] hover:text-snow-peak active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {/* ---- Search Trigger ---- */}
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={onSearchClick}
          className={cn(
            "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm",
            "bg-snow-peak/[0.03] text-mist ring-1 ring-inset ring-wolf-border/45",
            "transition-[background-color,color,box-shadow,transform] duration-150 ease-out",
            "hover:bg-snow-peak/[0.06] hover:text-snow-peak hover:ring-wolf-border/70",
            "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          )}
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">Search tickers...</span>
          <kbd className="hidden items-center gap-1 rounded-md bg-snow-peak/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-mist/60 ring-1 ring-inset ring-wolf-border/40 sm:inline-flex">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ---- Main Navigation ---- */}
      <nav className="scroll-quiet flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.09em] text-mist/50">
          Platform
        </p>
        {mainNav.map((item, itemIndex) => {
          const isActive = item.matchExact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              style={enterDelay(itemIndex * 25)}
              className={cn(
                "insight-enter relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-3 text-sm font-medium",
                // Only the properties that actually change. `transition-all`
                // was also watching layout properties for no reason.
                "transition-[background-color,color,transform] duration-150 ease-out",
                "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
                // The selected item was a filled orange slab - the loudest
                // thing on screen, for something that is only telling you where
                // you already are. A quiet raised surface plus a marker on the
                // rail says the same thing without competing with the content.
                isActive
                  ? "bg-snow-peak/[0.05] text-snow-peak"
                  : "text-mist hover:bg-snow-peak/[0.04] hover:text-snow-peak"
              )}
            >
              {isActive ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-sunset-orange"
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

        <div className="pt-4 space-y-1">
          <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.09em] text-mist/50">
            Recent Searches
          </p>
          <div className="space-y-0.5">
            {recentSearches.length > 0 ? (
              recentSearches.map((ticker) => (
                <Link
                  key={ticker}
                  href={ROUTES.SYMBOL(ticker)}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-mist",
                    "transition-[background-color,color,transform] duration-150 ease-out",
                    "hover:bg-snow-peak/[0.04] hover:text-snow-peak",
                    "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
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
        <Separator className="mb-3 opacity-40" />
        {user ? (
          <>
            <Link
              href={ROUTES.APP_SETTINGS}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-mist transition-[background-color,color,transform] duration-150 ease-out hover:bg-snow-peak/[0.04] hover:text-snow-peak active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
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
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-mist transition-[background-color,color,transform] duration-150 ease-out hover:bg-bearish/10 hover:text-bearish active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link
              href={ROUTES.SIGNUP}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg bg-sunset-orange px-3 py-2 text-sm font-medium text-wolf-black transition-[background-color,transform] duration-150 ease-out hover:bg-sunset-orange/90 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              Create free account
            </Link>
            <Link
              href={ROUTES.LOGIN}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-mist transition-[background-color,color,transform] duration-150 ease-out hover:bg-snow-peak/[0.04] hover:text-snow-peak active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              Log in
            </Link>
          </>
        )}

        <div className="px-3 pt-2 pb-1">
          <KoFiSupport text="Support Huntr on Ko-fi" />
        </div>
      </div>
      </aside>
    </>
  );
}
