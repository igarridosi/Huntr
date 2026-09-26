"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, LogOut, PanelLeftClose, PanelLeftOpen, Search, Settings, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { TooltipContent, TooltipRoot, TooltipTrigger } from "@/components/ui/tooltip";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { useAllProfiles } from "@/hooks/use-stock-data";
import { useRecentSearches } from "@/lib/recent-searches";
import { useSupabase } from "@/providers/supabase-provider";
import { mainNav } from "./sidebar";

/** Recent symbols shown, open or closed: the last few, not a history. */
const RECENTS = 5;

/** Apple's sheet curve: quick to leave, soft to land. */
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

interface DockSidebarProps {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  onSearchClick?: () => void;
}

/**
 * The desktop navigation for every section but Insights: a rail of icons
 * that is always there, and that opens into the full panel in place.
 *
 * It replaces a hamburger that hid the whole menu behind a click. The rail
 * keeps every section one click away while costing the page 80px, and the
 * open panel is the same surface growing wider, not a second menu sliding
 * in: the icons stay exactly where they were and the labels arrive beside
 * them. It floats over the page rather than pushing it, so charts do not
 * reflow each time it opens.
 */
export function DockSidebar({ expanded, onExpandedChange, onSearchClick }: DockSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { supabase, user } = useSupabase();
  const { data: profiles = [] } = useAllProfiles();
  const recentSearches = useRecentSearches();

  const logos = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.ticker, p.logo_url])),
    [profiles]
  );

  // ⌘B / Ctrl+B toggles from anywhere; Escape closes the open panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        onExpandedChange(!expanded);
      } else if (e.key === "Escape" && expanded) {
        onExpandedChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, onExpandedChange]);

  const recents = recentSearches.slice(0, RECENTS);

  return (
    <>
      {/* Outside the panel: a dim and a blur that push the page back, so the
          open menu is the one thing in focus. A click on it closes the menu. */}
      <div
        aria-hidden="true"
        onClick={() => onExpandedChange(false)}
        className={cn(
          "fixed inset-0 z-40 hidden bg-wolf-black/55 backdrop-blur-md transition-opacity duration-300 lg:block motion-reduce:transition-none",
          "[@media(prefers-reduced-transparency:reduce)]:bg-wolf-black/75 [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none",
          EASE,
          expanded ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        aria-label="Main navigation"
        data-expanded={expanded || undefined}
        className={cn(
          "group/dock fixed bottom-3 left-3 top-3 z-50 hidden flex-col overflow-hidden rounded-2xl lg:flex",
          // The material: the same translucent surface as the product's panels,
          // heavier here because it separates a whole region of the screen.
          "bg-wolf-surface supports-[backdrop-filter]:bg-wolf-surface/75 backdrop-blur-xl",
          "ring-1 ring-inset ring-wolf-border/60",
          "[@media(prefers-reduced-transparency:reduce)]:bg-wolf-surface [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none",
          "transition-[width,box-shadow] duration-300 motion-reduce:transition-none",
          EASE,
          expanded ? "w-64 shadow-2xl shadow-wolf-black/50" : "w-14 shadow-lg shadow-wolf-black/25"
        )}
      >
        {/* ---- Brand ---- */}
        <div className="flex h-14 shrink-0 items-center gap-3 px-2">
          <Link
            href={ROUTES.APP_INSIGHTS}
            aria-label="Huntr, go to Insights"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#162225] ring-1 ring-inset ring-white/[0.06] transition-transform duration-150 active:scale-[0.94] motion-reduce:active:scale-100"
          >
            {/* Fixed dark container keeps the white wolf visible in both themes */}
            <Image src="/logo/HunterLogoCut-removebg.png" alt="" width={30} height={23} className="h-auto w-[30px] object-contain" priority />
          </Link>
          <Reveal expanded={expanded} className="min-w-0">
            <span className="block text-[15px] font-bold leading-tight tracking-[-0.01em] text-snow-peak">HUNTR</span>
            <span className="block truncate font-mono text-[9px] uppercase leading-tight tracking-[0.14em] text-mist/50">
              Wolf of Value St.
            </span>
          </Reveal>
        </div>

        <div className="px-2 pb-2">
          <DockRow
            expanded={expanded}
            label="Search"
            icon={<Search className="h-[18px] w-[18px]" />}
            onClick={onSearchClick}
            trailing={<Kbd>⌘K</Kbd>}
          />
        </div>

        <Hairline />

        {/* ---- Sections ---- */}
        <nav className="scroll-quiet flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          <SectionLabel expanded={expanded}>Platform</SectionLabel>
          <ul className="space-y-0.5">
            {mainNav.map((item) => {
              const active = item.matchExact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <DockRow
                    expanded={expanded}
                    label={item.label}
                    href={item.href}
                    active={active}
                    icon={<item.icon className="h-[18px] w-[18px]" />}
                  />
                </li>
              );
            })}
          </ul>

          {recents.length > 0 ? (
            <>
              <SectionLabel expanded={expanded} className="mt-4">
                Recent
              </SectionLabel>
              <ul className="space-y-0.5">
                {recents.map((ticker) => (
                  <li key={ticker}>
                    <DockRow
                      expanded={expanded}
                      label={ticker}
                      mono
                      href={ROUTES.SYMBOL(ticker)}
                      icon={
                        <TickerLogo
                          ticker={ticker}
                          src={logos[ticker]}
                          className="h-5 w-5"
                          imageClassName="rounded-md"
                          fallbackClassName="rounded-md text-[9px]"
                        />
                      }
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </nav>

        <Hairline />

        {/* ---- Account, and the control that opens and closes the panel ---- */}
        <div className="shrink-0 space-y-0.5 px-2 py-2">
          {user ? (
            <>
              <DockRow
                expanded={expanded}
                label="Settings"
                href={ROUTES.APP_SETTINGS}
                active={pathname.startsWith(ROUTES.APP_SETTINGS)}
                icon={<Settings className="h-[18px] w-[18px]" />}
              />
              <DockRow
                expanded={expanded}
                label="Sign out"
                tone="danger"
                icon={<LogOut className="h-[18px] w-[18px]" />}
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push(ROUTES.LOGIN);
                }}
              />
            </>
          ) : (
            <>
              <DockRow
                expanded={expanded}
                label="Create free account"
                tone="accent"
                href={ROUTES.SIGNUP}
                icon={<UserPlus className="h-[18px] w-[18px]" />}
              />
              <DockRow expanded={expanded} label="Log in" href={ROUTES.LOGIN} icon={<LogIn className="h-[18px] w-[18px]" />} />
            </>
          )}
          <DockRow
            expanded={expanded}
            label={expanded ? "Collapse sidebar" : "Open sidebar"}
            ariaExpanded={expanded}
            icon={
              expanded ? <PanelLeftClose className="h-[18px] w-[18px]" /> : <PanelLeftOpen className="h-[18px] w-[18px]" />
            }
            onClick={() => onExpandedChange(!expanded)}
            trailing={<Kbd>⌘B</Kbd>}
            tooltipTrailing="⌘B"
          />
        </div>
      </aside>
    </>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────────────────── */

interface DockRowProps {
  expanded: boolean;
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  mono?: boolean;
  tone?: "default" | "danger" | "accent";
  trailing?: ReactNode;
  tooltipTrailing?: string;
  ariaExpanded?: boolean;
}

/**
 * One row, in both states. The icon sits in a fixed 40px cell, so it does
 * not move when the panel opens; the label is always in the markup (it is
 * the row's accessible name) and only fades in once there is room for it.
 * Collapsed, a tooltip to the right names the row instead.
 */
function DockRow({
  expanded,
  label,
  icon,
  href,
  onClick,
  active = false,
  mono = false,
  tone = "default",
  trailing,
  tooltipTrailing,
  ariaExpanded,
}: DockRowProps) {
  const className = cn(
    "relative flex h-10 w-full items-center rounded-xl text-sm font-medium outline-none",
    "transition-[background-color,color,transform] duration-150 ease-out",
    "active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
    "focus-visible:ring-2 focus-visible:ring-sunset-orange/60",
    active
      ? "bg-snow-peak/[0.07] text-snow-peak"
      : tone === "danger"
        ? "text-mist hover:bg-bearish/10 hover:text-bearish"
        : tone === "accent"
          ? "text-sunset-orange hover:bg-sunset-orange/10"
          : "text-mist hover:bg-snow-peak/[0.05] hover:text-snow-peak"
  );

  const body = (
    <>
      {/* Where you are: a short mark on the edge, and the icon in the accent. */}
      {active ? <span aria-hidden="true" className="absolute inset-y-2.5 -left-2 w-[3px] rounded-r-full bg-sunset-orange" /> : null}
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center transition-colors duration-150",
          active && "text-sunset-orange"
        )}
      >
        {icon}
      </span>
      <Reveal expanded={expanded} className={cn("flex min-w-0 flex-1 items-center gap-2 pr-2", mono && "font-mono text-xs font-semibold tracking-wide")}>
        <span className="truncate">{label}</span>
        {trailing ? <span className="ml-auto">{trailing}</span> : null}
      </Reveal>
    </>
  );

  const control = href ? (
    <Link href={href} aria-current={active ? "page" : undefined} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-expanded={ariaExpanded} className={cn(className, "cursor-pointer text-left")}>
      {body}
    </button>
  );

  return (
    // Open, the label is right there: the tooltip would only repeat it.
    <TooltipRoot open={expanded ? false : undefined} delayDuration={120}>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={14} className="flex items-center gap-2">
        <span className={mono ? "font-mono" : undefined}>{label}</span>
        {tooltipTrailing ? <span className="font-mono text-[10px] text-mist">{tooltipTrailing}</span> : null}
      </TooltipContent>
    </TooltipRoot>
  );
}

/** Content that only shows once the panel is open: it fades after the width has started, and first on the way out. */
function Reveal({ expanded, className, children }: { expanded: boolean; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap transition-opacity motion-reduce:transition-none",
        expanded ? "opacity-100 delay-75 duration-200" : "pointer-events-none opacity-0 duration-100",
        className
      )}
    >
      {children}
    </span>
  );
}

/** A group's name when open; a short rule in its place on the rail. */
function SectionLabel({ expanded, className, children }: { expanded: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("relative mb-1 flex h-6 items-center", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-3 h-px w-4 bg-wolf-border transition-opacity duration-150 motion-reduce:transition-none",
          expanded ? "opacity-0" : "opacity-100"
        )}
      />
      <Reveal
        expanded={expanded}
        className="px-3 text-[10px] font-medium uppercase tracking-[0.09em] text-mist/50"
      >
        {children}
      </Reveal>
    </div>
  );
}

function Hairline() {
  return <div aria-hidden="true" className="mx-3 h-px shrink-0 bg-wolf-border/50" />;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md bg-snow-peak/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-mist/60 ring-1 ring-inset ring-wolf-border/40">
      {children}
    </kbd>
  );
}
