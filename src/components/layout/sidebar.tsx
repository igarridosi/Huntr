"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  TrendingUp,
  Star,
  Settings,
  LogOut,
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { Separator } from "@/components/ui/separator";

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
    label: "Dashboard",
    href: ROUTES.APP,
    icon: LayoutDashboard,
    matchExact: true,
  },
  {
    label: "Watchlist",
    href: ROUTES.APP,
    icon: Star,
    matchExact: true,
  },
];

const exploreNav: NavItem[] = [
  {
    label: "Markets",
    href: ROUTES.APP,
    icon: TrendingUp,
  },
];

export function Sidebar({ onSearchClick }: SidebarProps) {
  const pathname = usePathname();

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

        <div className="pt-4" />

        <p className="px-3 text-[10px] font-semibold text-mist/50 uppercase tracking-widest mb-2">
          Explore
        </p>
        {exploreNav.map((item) => {
          const isActive = pathname.startsWith(item.href) && item.href !== ROUTES.APP;

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
