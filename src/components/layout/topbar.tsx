"use client";

import { Search, Menu, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TopbarProps {
  onSearchClick?: () => void;
  onMenuClick?: () => void;
  onDesktopMenuClick?: () => void;
  showDesktopMenuToggle?: boolean;
}

export function Topbar({
  onSearchClick,
  onMenuClick,
  onDesktopMenuClick,
  showDesktopMenuToggle = false,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center h-14 px-4 lg:px-6 bg-wolf-black/80 backdrop-blur-md border-b border-wolf-border/30">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="inline-flex lg:hidden mr-2"
        onClick={onMenuClick}
        aria-label="Toggle menu"
      >
        <Menu className="w-5 h-5" />
      </Button>

      {showDesktopMenuToggle ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden lg:inline-flex mr-2"
          onClick={onDesktopMenuClick}
          aria-label="Toggle desktop menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
      ) : null}

      {/* Mobile brand */}
      <div className="flex items-center gap-2 lg:hidden">
        <Crosshair className="w-4 h-4 text-sunset-orange" />
        <span className="text-sm font-bold tracking-tight">HUNTR</span>
      </div>

      <div className="flex-1" />

      {/* Search trigger (mobile + desktop) */}
      <button
        type="button"
        onClick={onSearchClick}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
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
    </header>
  );
}
