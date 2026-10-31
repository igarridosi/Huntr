"use client";

import { Search, Menu } from "lucide-react";
import { BrandMark } from "@/components/ui/brand-mark";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { KoFiSupport } from "@/components/ui/kofi-support";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AddTickerDialog } from "@/components/ui/add-ticker-dialog";
import { MarketPulse } from "@/components/layout/market-pulse";
import { useScrolled } from "@/hooks/use-scrolled";

interface TopbarProps {
  onSearchClick?: () => void;
  onMenuClick?: () => void;
}

export function Topbar({
  onSearchClick,
  onMenuClick,
}: TopbarProps) {
  const scrolled = useScrolled();
  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        // On large screens the bar is 12px taller at the top, so its controls
        // sit on the same line as the floating sidebar's brand row.
        "sticky top-0 z-30 flex h-14 items-center px-4 lg:h-[4.25rem] lg:px-6 lg:pt-3",
        "bg-wolf-black/80 backdrop-blur-md [@media(prefers-reduced-transparency:reduce)]:bg-wolf-black [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none",
        // No divider: a scroll edge. Content fades into the bar, and only once
        // it is actually passing under it.
        "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-wolf-black/80 after:to-transparent after:opacity-0 after:transition-opacity after:duration-300 after:content-[''] data-[scrolled]:after:opacity-100 motion-reduce:after:transition-none"
      )}
    >
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="mr-2 inline-flex h-10 w-10 lg:hidden"
        onClick={onMenuClick}
        aria-label="Toggle menu"
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* Mobile brand */}
      <div className="flex items-center gap-2 lg:hidden">
        <BrandMark title="Huntr" className="w-9" />
        <span className="text-sm font-bold tracking-tight">HUNTR</span>
      </div>

      {/* The left side, used: the market's day, the indices, the mood. */}
      <MarketPulse className="ml-3 hidden flex-1 sm:flex lg:ml-0" />
      <div className="flex-1 sm:hidden" />

      {/* Add ticker */}
      <span className="ml-3 shrink-0">
        <AddTickerDialog />
      </span>

      {/* Search trigger (mobile + desktop) */}
      <button
        type="button"
        onClick={onSearchClick}
        // The visible label is hidden below `sm`, so the button has no name on a phone.
        aria-label="Search tickers"
        className={cn(
          "ml-2 flex h-10 items-center gap-2 rounded-lg px-3 text-sm sm:h-auto sm:py-1.5",
          "text-mist hover:text-snow-peak",
          "bg-wolf-surface/50 border border-wolf-border/50",
          "hover:bg-wolf-surface transition-all duration-200",
          "cursor-pointer"
        )}
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline text-mist/80">
          Search...
        </span>
        <kbd className="hidden md:inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 text-[10px] font-mono text-mist/50 bg-wolf-black/50 rounded border border-wolf-border/50">
          ⌘K
        </kbd>
      </button>

      <ThemeToggle className="ml-2" />
      <KoFiSupport className="ml-2 hidden md:block" text="Support Huntr" />
    </header>
  );
}
