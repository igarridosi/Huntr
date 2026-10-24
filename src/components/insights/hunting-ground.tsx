"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Crosshair, Info, LayoutGrid, Maximize2, ScatterChart, Search, Star, X, ZoomIn } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { SectionHeader } from "@/components/insights/section-header";
import { useStoredChoice } from "@/components/insights/use-stored-choice";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { ROUTES } from "@/lib/constants";
import { cn, formatCompactNumber, formatPercent } from "@/lib/utils";
import { HG_RULES, HG_ZONES, placeCard, rankZone, separate, yPosition, type HgPoint, type HgZone, type HuntingGround } from "@/lib/hunting-ground";

/** The chart's least height; beside a taller card it grows to fill the row. */
const MIN_HEIGHT = 380;
/**
 * Space around the plot. Labels live in these margins, never over the
 * plot, so nothing covers a company: the zones' names in a band above (the
 * top two) and below (the bottom two), the ticks under the plot, and in the
 * full map the yield median in a right-hand gutter.
 */
const PAD_CARD = { top: 30, right: 12, bottom: 50, left: 40 };
const PAD_FULL = { top: 40, right: 64, bottom: 58, left: 44 };
const Y_TICKS = [-0.02, 0, 0.01, 0.02, 0.04, 0.06, 0.1];
/** Quality axis from 15: almost no large company scores below, and the room goes to where they are. */
const Q_MIN = 15;

/** Zone tints: green where to hunt, red where not to, neutral in between. */
const ZONE_FILL: Record<HgZone, string> = {
  prime: "var(--color-bullish)",
  "paying-up": "var(--color-glacier)",
  trap: "var(--color-golden-hour)",
  avoid: "var(--color-bearish)",
};

const ZONE_ORDER: HgZone[] = ["prime", "paying-up", "trap", "avoid"];

/** One colour per GICS sector, for colouring by sector in the expanded view. */
const SECTOR_COLOR: Record<string, string> = {
  "Information Technology": "#5CCFD6",
  "Communication Services": "#A78BFA",
  "Consumer Discretionary": "#FF8C42",
  "Consumer Staples": "#9BD17A",
  "Health Care": "#F08BA7",
  Industrials: "#7FA7D9",
  Energy: "#E6B43C",
  Materials: "#C79A6B",
  Utilities: "#4FC3A1",
  Financials: "#FFBF69",
  "Real Estate": "#B8C2C6",
};
const sectorColor = (sector: string | null) => (sector && SECTOR_COLOR[sector]) || "var(--color-mist)";

type ColorBy = "move" | "sector";

/** A bubble's colour: today's move, stronger the bigger it is (full at 3%). */
function moveFill(change: number) {
  const strength = Math.min(1, Math.abs(change) / 0.03);
  if (Math.abs(change) < 0.0015) return { color: "var(--color-mist)", opacity: 0.4 };
  return { color: change > 0 ? "var(--color-bullish)" : "var(--color-bearish)", opacity: 0.35 + 0.55 * strength };
}

/** A move with its sign; one too small to show reads 0.0%, not -0.0%. */
const signed = (v: number, digits = 1) => {
  const shown = Math.abs(v) < 0.5 * 10 ** -(digits + 2) ? 0 : v;
  return `${shown > 0 ? "+" : ""}${formatPercent(shown, digits)}`;
};

/**
 * The Hunting Ground (src/lib/hunting-ground.ts): the largest companies by
 * quality across and free-cash-flow yield up, sized by market cap and
 * coloured by today's move, in four named zones. Hover or tap a company for
 * its card; the sector chips dim the rest rather than remove it, so nothing
 * jumps. On a phone, where a scatter cannot be read, each zone is a short
 * list.
 *
 * Two views, the reader's choice (kept per browser): the map, and a simple
 * one with the same zones and data as four ranked lists laid out where the
 * zones sit on the map.
 */
type HgView = "map" | "simple";
const VIEWS: readonly HgView[] = ["map", "simple"];
const VIEW_ITEMS = [
  { key: "map", label: "Map", icon: <ScatterChart className="h-3.5 w-3.5" /> },
  { key: "simple", label: "Simple", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
] as const;

export function HuntingGroundCard({
  ground,
  loading,
  newsTickers,
  onWatch,
  isWatched,
  className,
}: {
  ground: HuntingGround | null;
  loading: boolean;
  /** Companies with a story in "What's moving the market" today. */
  newsTickers: Set<string>;
  /** Opens the page's watchlist picker for a company (or the sign-in gate). */
  onWatch: (ticker: string) => void;
  isWatched: (ticker: string) => boolean;
  className?: string;
}) {
  const [sector, setSector] = useState<string | null>(null);
  const [view, setView] = useStoredChoice<HgView>("huntr:hunting-view", VIEWS, "map");
  const [pinned, setPinned] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const points = useMemo(() => ground?.points ?? [], [ground]);

  const sectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of points) if (p.sector) counts.set(p.sector, (counts.get(p.sector) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
  }, [points]);

  const counts = useMemo(() => {
    const c: Record<HgZone, number> = { prime: 0, "paying-up": 0, trap: 0, avoid: 0 };
    for (const p of points) if (!sector || p.sector === sector) c[p.zone]++;
    return c;
  }, [points, sector]);

  return (
    <Card className={className}>
      <CardContent className="flex h-full flex-col p-4 sm:p-5">
        <SectionHeader
          icon={Crosshair}
          title="The Hunting Ground"
          subtitle="Where the largest companies sit on quality and price"
        >
          <SegmentedTabs items={VIEW_ITEMS} value={view} onChange={setView} ariaLabel="Hunting Ground view" size="sm" />
          {points.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Open the full map"
              title="Open the full map"
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-mist ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-snow-peak/[0.05] hover:text-snow-peak sm:flex"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </SectionHeader>

        {sectors.length > 0 ? (
          <div className="mt-4 flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }} role="radiogroup" aria-label="Sector">
            {[null, ...sectors].map((name) => (
              <button
                key={name ?? "all"}
                type="button"
                role="radio"
                aria-checked={sector === name}
                onClick={() => setSector(name)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors duration-150",
                  sector === name
                    ? "bg-sunset-orange/[0.12] text-sunset-orange ring-sunset-orange/35"
                    : "text-mist ring-wolf-border/50 hover:text-snow-peak hover:ring-wolf-border/80"
                )}
              >
                {name ?? "All sectors"}
              </button>
            ))}
          </div>
        ) : null}

        {loading && points.length === 0 ? (
          <HuntingGroundLoader />
        ) : points.length === 0 ? (
          <p className="mt-6 text-[13px] text-mist">No company has both a quality score and a free-cash-flow yield yet.</p>
        ) : (
          view === "simple" ? (
            <ZoneGrid points={points} sector={sector} counts={counts} className="mt-3 flex-1" />
          ) : (
            <>
              <div className="mt-3 hidden min-h-[380px] flex-1 sm:block">
                <Scatter
                  points={points}
                  sector={sector}
                  counts={counts}
                  newsTickers={newsTickers}
                  onWatch={onWatch}
                  isWatched={isWatched}
                  pinned={pinned}
                  onPinnedChange={setPinned}
                />
              </div>
              <ZoneLists points={points} sector={sector} className="mt-3 sm:hidden" />
            </>
          )
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-mist">
          {view === "map" ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-bullish/80" /> Up today
              </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-bearish/80" /> Down today
          </span>
              <span>Size: market cap</span>
            </>
          ) : (
            <span>Same zones as the map: across is quality, up is cheaper. Best first in each.</span>
          )}
          {ground ? <Criteria ground={ground} className="ml-auto" /> : null}
        </div>
      </CardContent>
      {ground && expanded ? (
        <ExpandedMap
          ground={ground}
          newsTickers={newsTickers}
          onWatch={onWatch}
          isWatched={isWatched}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </Card>
  );
}

// ── Who is on the map ──────────────────────────────────────────────────────

/**
 * "How companies get here": the rules, each with how many companies it
 * placed or left out today, so a missing name has a reason.
 */
function Criteria({ ground, className }: { ground: HuntingGround; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rows = [
    { n: ground.points.length, label: "placed on the map", strong: true },
    { n: ground.financials, label: "banks, insurers, asset managers and property owners: free cash flow does not measure them (Visa, Mastercard and the exchanges do get placed)" },
    { n: ground.noQuality, label: "without a Huntr quality score yet (scores are computed weekly from the filings)" },
    { n: ground.noYield, label: "without a free-cash-flow figure" },
    { n: ground.merged, label: "second share classes, shown once under the larger one (GOOGL for GOOG)" },
  ].filter((r) => r.n > 0 || r.strong);

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-mist/80 transition-colors duration-150 hover:bg-snow-peak/[0.05] hover:text-snow-peak"
      >
        <Info className="h-3.5 w-3.5" />
        {ground.points.length} of the {ground.considered} largest · how companies get here
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="How companies get on the map"
          className="hg-card absolute bottom-7 right-0 z-30 w-[22rem] rounded-xl bg-wolf-black/95 p-4 text-[12px] leading-relaxed text-mist shadow-2xl ring-1 ring-inset ring-wolf-border/70 backdrop-blur"
        >
          <p className="text-[13px] font-semibold text-snow-peak">How companies get on the map</p>
          <p className="mt-1.5">
            The {ground.considered} largest companies in Huntr (over $10B), placed by their quality score and free-cash-flow yield.
            A foreign filer&apos;s cash flow is converted to its share&apos;s currency first.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {rows.map((r) => (
              <li key={r.label} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2">
                <span className={cn("text-right font-mono tabular-nums", r.strong ? "font-semibold text-snow-peak" : "text-snow-peak/80")}>{r.n}</span>
                <span className={r.strong ? "text-snow-peak" : undefined}>{r.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 border-t border-wolf-border/40 pt-2.5">
            The zones split at a quality of {HG_RULES.QUALITY_LINE} and a yield of {HG_RULES.CHEAP_YIELD * 100}% (paying 25 times the cash a company makes).
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ── The full map ───────────────────────────────────────────────────────────

/**
 * The map at full size, with what the card has no room for: a search that
 * finds and opens a company, colour by sector as well as by today's move,
 * a label on most bubbles, a finer grid with the medians of the companies
 * shown, and each zone's best beside the map. A zone opens in close-up:
 * the camera glides into its corner of the map, and beside it the zone's
 * companies in full. A native <dialog>, on the news preview's transitions.
 */
function ExpandedMap({
  ground,
  newsTickers,
  onWatch,
  isWatched,
  onClose,
}: {
  ground: HuntingGround;
  newsTickers: Set<string>;
  onWatch: (ticker: string) => void;
  isWatched: (ticker: string) => boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("move");
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<string | null>(null);
  const [zoom, setZoom] = useState<HgZone | null>(null);
  const points = ground.points;

  // As many companies per zone as the side column has room for, so all four
  // zones show without scrolling: a zone's header and padding take about
  // 44 px, each company 26 px.
  const aside = useRef<HTMLElement>(null);
  const [perZone, setPerZone] = useState(5);
  useLayoutEffect(() => {
    const el = aside.current;
    if (!el) return;
    const measure = () => {
      const room = (el.clientHeight - 3 * 8) / 4 - 44;
      setPerZone(Math.max(1, Math.min(8, Math.floor(room / 26))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom]);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const sectors = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of points) if (p.sector) c.set(p.sector, (c.get(p.sector) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [points]);
  const counts = useMemo(() => {
    const c: Record<HgZone, number> = { prime: 0, "paying-up": 0, trap: 0, avoid: 0 };
    for (const p of points) if (!sector || p.sector === sector) c[p.zone]++;
    return c;
  }, [points, sector]);

  const q = query.trim().toLowerCase();
  const matches = q ? points.filter((p) => p.ticker.toLowerCase().startsWith(q) || p.name.toLowerCase().includes(q)) : [];
  const shown = sector ? points.filter((p) => p.sector === sector) : points;

  return (
    <dialog
      ref={dialog}
      aria-label="The Hunting Ground, full map"
      onClose={onClose}
      // Escape steps out of a zone first, then closes the map.
      onCancel={(e) => {
        if (zoom) {
          e.preventDefault();
          setZoom(null);
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
      className="hg-dialog m-auto h-[min(54rem,calc(100dvh-2rem))] w-[min(96rem,calc(100vw-2rem))] max-w-none overflow-visible bg-transparent p-0 text-snow-peak backdrop:bg-transparent"
    >
      <div className="flex h-full flex-col rounded-2xl bg-wolf-surface p-4 shadow-2xl ring-1 ring-inset ring-wolf-border/70 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sunset-orange/[0.08] ring-1 ring-inset ring-sunset-orange/25">
              <Crosshair className="h-[18px] w-[18px] text-sunset-orange" />
            </span>
            <div>
              <p className="text-[16px] font-semibold leading-tight">The Hunting Ground</p>
              <p className="text-[11.5px] text-mist">
                {zoom
                  ? `${HG_ZONES[zoom].label} close up · Escape or "All zones" to step back`
                  : `${shown.length} companies · quality across, cheaper up, size is market cap · click a zone to look closer`}
              </p>
            </div>
          </div>

          <label className="relative ml-auto flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-mist" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) {
                  setPinned(matches[0].ticker);
                  if (zoom && matches[0].zone !== zoom) setZoom(matches[0].zone);
                }
              }}
              placeholder="Find a company"
              aria-label="Find a company on the map"
              className="h-8 w-48 rounded-lg bg-snow-peak/[0.04] pl-8 pr-2 text-[12.5px] text-snow-peak ring-1 ring-inset ring-wolf-border/50 placeholder:text-mist/70 focus:outline-none focus:ring-sunset-orange/60"
            />
          </label>
          <SegmentedTabs
            items={[
              { key: "move", label: "Today's move" },
              { key: "sector", label: "Sector" },
            ] as const}
            value={colorBy}
            onChange={setColorBy}
            ariaLabel="Colour the bubbles by"
            size="sm"
          />
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close the full map"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-mist ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-snow-peak/[0.06] hover:text-snow-peak"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }} role="radiogroup" aria-label="Sector">
          {[null, ...sectors].map((name) => (
            <button
              key={name ?? "all"}
              type="button"
              role="radio"
              aria-checked={sector === name}
              onClick={() => setSector(name)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors duration-150",
                sector === name
                  ? "bg-sunset-orange/[0.12] text-sunset-orange ring-sunset-orange/35"
                  : "text-mist ring-wolf-border/50 hover:text-snow-peak hover:ring-wolf-border/80"
              )}
            >
              {colorBy === "sector" && name ? <span className="h-2 w-2 rounded-full" style={{ background: sectorColor(name) }} /> : null}
              {name ?? "All sectors"}
            </button>
          ))}
        </div>

        <div
          className={cn(
            "mt-3 grid min-h-0 flex-1 grid-cols-1 gap-4",
            zoom ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]" : "lg:grid-cols-[minmax(0,1fr)_17rem]"
          )}
        >
          <div className="min-h-[24rem]">
            <Scatter
              points={points}
              sector={sector}
              counts={counts}
              newsTickers={newsTickers}
              onWatch={onWatch}
              isWatched={isWatched}
              pinned={pinned}
              onPinnedChange={setPinned}
              expanded
              colorBy={colorBy}
              matches={q ? new Set(matches.map((p) => p.ticker)) : null}
              zoom={zoom}
              onZoom={setZoom}
            />
          </div>
          {zoom ? (
            <ZoneDetail
              key={`${zoom}-${sector ?? "all"}`}
              zone={zoom}
              points={shown.filter((p) => p.zone === zoom)}
              pinned={pinned}
              onPin={setPinned}
              onBack={() => setZoom(null)}
              className="hidden lg:flex"
            />
          ) : (
            <aside ref={aside} className="hidden min-h-0 flex-col gap-2 overflow-hidden lg:flex">
              {GRID_ORDER.map((zone) => (
                <section key={zone} className="min-h-0 flex-1 rounded-xl bg-snow-peak/[0.025] px-2.5 py-2 ring-1 ring-inset ring-wolf-border/40">
                  <button
                    type="button"
                    onClick={() => setZoom(zone)}
                    className="group flex w-full items-baseline justify-between gap-2 rounded-md px-1 text-left"
                    title={`Look closer at ${HG_ZONES[zone].label}`}
                  >
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: ZONE_FILL[zone] }}>
                      {HG_ZONES[zone].label}
                      <ZoomIn className="h-3 w-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
                    </span>
                    <span className="font-mono text-[11px] text-mist">{counts[zone]}</span>
                  </button>
                  <ol className="mt-1">
                    {rankZone(shown, zone)
                      .slice(0, perZone)
                      .map((p) => (
                        <li key={p.ticker}>
                          <button
                            type="button"
                            onClick={() => setPinned(p.ticker)}
                            className={cn(
                              "flex h-[26px] w-full items-center gap-2 rounded-md px-1 text-left transition-colors duration-150 hover:bg-snow-peak/[0.05]",
                              pinned === p.ticker && "bg-snow-peak/[0.07]"
                            )}
                          >
                            <TickerLogo ticker={p.ticker} src={p.logo} className="h-5 w-5" imageClassName="rounded" fallbackClassName="rounded text-[7px]" />
                            <span className="w-12 text-[11.5px] font-semibold">{p.ticker}</span>
                            <span className="flex-1 truncate font-mono text-[10.5px] text-mist">
                              Q {p.quality} · {formatPercent(p.fcfYield, 1)}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ol>
                </section>
              ))}
            </aside>
          )}
        </div>
      </div>
    </dialog>
  );
}

// ── A zone, close up ───────────────────────────────────────────────────────

const ZONE_RULE: Record<HgZone, string> = {
  prime: `A quality of ${HG_RULES.QUALITY_LINE} or more, and a free-cash-flow yield of ${HG_RULES.CHEAP_YIELD * 100}% or more: good businesses for 25 times their cash or less.`,
  "paying-up": `A quality of ${HG_RULES.QUALITY_LINE} or more, at a yield under ${HG_RULES.CHEAP_YIELD * 100}%: good businesses the market already prices as such.`,
  trap: `A yield of ${HG_RULES.CHEAP_YIELD * 100}% or more, at a quality under ${HG_RULES.QUALITY_LINE}: cheap, and the business explains why.`,
  avoid: `A quality under ${HG_RULES.QUALITY_LINE} and a yield under ${HG_RULES.CHEAP_YIELD * 100}%: neither a good business nor a cheap one.`,
};

type ZoneSort = "best" | "quality" | "yield" | "size" | "today";

/** How long the camera takes to move into a zone (the CSS transitions' 500 ms, less the last few frames). */
const CAMERA_MS = 460;
const SORTS = [
  { key: "best", label: "Best" },
  { key: "quality", label: "Quality" },
  { key: "yield", label: "Yield" },
  { key: "size", label: "Size" },
  { key: "today", label: "Today" },
] as const;

const median = (vs: number[]) => {
  if (vs.length === 0) return null;
  const s = [...vs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Everything about one zone: what puts a company there, the zone in
 * numbers (how many, the medians, its weight in the market, how it trades
 * today, its sector mix), and every company in it, sortable, each opening
 * its card on the map.
 */
function ZoneDetail({
  zone,
  points,
  pinned,
  onPin,
  onBack,
  className,
}: {
  zone: HgZone;
  points: HgPoint[];
  pinned: string | null;
  onPin: (ticker: string) => void;
  onBack: () => void;
  className?: string;
}) {
  const [sort, setSort] = useState<ZoneSort>("best");
  // The list (dozens of rows and logos) mounts once the camera has arrived:
  // built during the move, it held the main thread and the move stuttered.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), CAMERA_MS);
    return () => window.clearTimeout(id);
  }, []);
  const rows = useMemo(() => {
    const by: Record<ZoneSort, (a: HgPoint, b: HgPoint) => number> = {
      best: () => 0,
      quality: (a, b) => b.quality - a.quality,
      yield: (a, b) => b.fcfYield - a.fcfYield,
      size: (a, b) => b.marketCap - a.marketCap,
      today: (a, b) => b.change - a.change,
    };
    return sort === "best" ? rankZone(points, zone) : [...points].sort(by[sort]);
  }, [points, zone, sort]);

  const medQ = median(points.map((p) => p.quality));
  const medY = median(points.map((p) => p.fcfYield));
  const cap = points.reduce((sum, p) => sum + p.marketCap, 0);
  const up = points.filter((p) => p.change > 0).length;
  const avgMove = points.length ? points.reduce((s, p) => s + p.change, 0) / points.length : 0;
  const mix = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of points) c.set(p.sector ?? "Other", (c.get(p.sector ?? "Other") ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [points]);

  const stats = [
    { label: "Companies", value: String(points.length) },
    { label: "Median quality", value: medQ != null ? String(medQ) : "–" },
    { label: "Median FCF yield", value: medY != null ? formatPercent(medY, 1) : "–", hint: medY && medY > 0 ? `${Math.round(1 / medY)}× cash` : undefined },
    { label: "Market cap", value: `$${formatCompactNumber(cap)}` },
    { label: "Up today", value: `${up} of ${points.length}` },
    { label: "Average move", value: signed(avgMove, 2), tone: avgMove >= 0 ? "text-bullish" : "text-bearish" },
  ];

  return (
    <aside className={cn("hg-zoom-panel min-h-0 flex-col overflow-hidden rounded-xl bg-snow-peak/[0.02] ring-1 ring-inset ring-wolf-border/40", className)}>
      <div className="border-b border-wolf-border/30 p-3.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md text-[11.5px] text-mist transition-colors duration-150 hover:text-snow-peak"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All zones
        </button>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-[17px] font-semibold" style={{ color: ZONE_FILL[zone] }}>
            {HG_ZONES[zone].label}
          </span>
          <span className="text-[12px] text-mist">{HG_ZONES[zone].line}</span>
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-mist">{ZONE_RULE[zone]}</p>

        <dl className="mt-3 grid grid-cols-3 gap-1.5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-snow-peak/[0.03] px-2 py-1.5 ring-1 ring-inset ring-wolf-border/30">
              <dt className="truncate text-[10px] text-mist">{s.label}</dt>
              <dd className={cn("font-mono text-[13px] font-semibold tabular-nums text-snow-peak", s.tone)}>
                {s.value}
                {s.hint ? <span className="ml-1 text-[10px] font-normal text-mist">{s.hint}</span> : null}
              </dd>
            </div>
          ))}
        </dl>

        {mix.length > 0 ? (
          <div className="mt-3">
            <div className="flex h-1.5 overflow-hidden rounded-full" aria-hidden>
              {mix.map(([name, n]) => (
                <span key={name} style={{ width: `${(n / points.length) * 100}%`, background: sectorColor(name) }} />
              ))}
            </div>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-mist">
              {mix.slice(0, 4).map(([name, n]) => (
                <span key={name} className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: sectorColor(name) }} />
                  {name} {n}
                </span>
              ))}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-mist">Companies</span>
        <SegmentedTabs items={SORTS} value={sort} onChange={setSort} ariaLabel="Sort the zone's companies" size="sm" />
      </div>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_4.5rem_4.25rem_3.5rem_3.5rem] gap-2 px-3.5 text-[9.5px] uppercase tracking-[0.08em] text-mist/60">
        <span>Company</span>
        <span>Quality</span>
        <span className="text-right">FCF yield</span>
        <span className="text-right">Cap</span>
        <span className="text-right">Today</span>
      </div>
      <ol className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2" style={{ scrollbarWidth: "thin" }}>
        {(ready ? rows : []).map((p, i) => (
          <li key={p.ticker} className="hg-zoom-row" style={{ "--row-delay": `${Math.min(i * 25, 350)}ms` } as React.CSSProperties}>
            <button
              type="button"
              onClick={() => onPin(p.ticker)}
              className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_4.5rem_4.25rem_3.5rem_3.5rem] items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-snow-peak/[0.05]",
                pinned === p.ticker && "bg-snow-peak/[0.08] ring-1 ring-inset ring-wolf-border/60"
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <TickerLogo ticker={p.ticker} src={p.logo} className="h-6 w-6" imageClassName="rounded-md" fallbackClassName="rounded-md text-[8px]" />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold leading-tight">{p.ticker}</span>
                  <span className="block truncate text-[10.5px] leading-tight text-mist">{p.name}</span>
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 font-mono text-[11.5px] tabular-nums">{p.quality}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-snow-peak/[0.08]">
                  <span className="block h-full rounded-full bg-sunset-orange/80" style={{ width: `${p.quality}%` }} />
                </span>
              </span>
              <span className="text-right font-mono text-[11.5px] tabular-nums">
                {formatPercent(p.fcfYield, 1)}
                <span className="block text-[9.5px] text-mist">{p.fcfYield > 0 ? `${Math.round(1 / p.fcfYield)}× cash` : "burns cash"}</span>
              </span>
              <span className="text-right font-mono text-[11px] tabular-nums text-mist">${formatCompactNumber(p.marketCap)}</span>
              <span className={cn("text-right font-mono text-[11.5px] tabular-nums", p.change >= 0 ? "text-bullish" : "text-bearish")}>
                {signed(p.change)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

// ── The scatter (sm and up) ────────────────────────────────────────────────

/** How far past a bubble's edge the pointer may go before its card closes. */
const HOVER_SLACK = 22;

/** What the camera frames: a span of quality across and of yield position (0-1) up. */
interface View {
  q0: number;
  q1: number;
  p0: number;
  p1: number;
}

const FULL_VIEW: View = { q0: Q_MIN, q1: 100, p0: 0, p1: 1 };

/** A zone's corner of the map, with a little of its neighbours for context. */
function zoneView(zone: HgZone): View {
  const q = HG_RULES.QUALITY_LINE;
  const p = yPosition(HG_RULES.CHEAP_YIELD);
  const right = zone === "prime" || zone === "paying-up";
  const top = zone === "prime" || zone === "trap";
  return {
    q0: right ? q - 3 : Q_MIN,
    q1: right ? 100 : q + 3,
    p0: top ? p - 0.03 : 0,
    p1: top ? 1 : p + 0.03,
  };
}

/** Every quality and yield tick the camera may show; each appears when there is room. */
const Q_TICKS = Array.from({ length: 18 }, (_, i) => 15 + i * 5);
const Y_TICKS_ALL = [-0.02, -0.01, 0, 0.005, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1];

function Scatter({
  points,
  sector,
  counts,
  newsTickers,
  onWatch,
  isWatched,
  pinned,
  onPinnedChange,
  expanded = false,
  colorBy = "move",
  matches = null,
  zoom = null,
  onZoom,
}: {
  points: HgPoint[];
  sector: string | null;
  counts: Record<HgZone, number>;
  newsTickers: Set<string>;
  onWatch: (ticker: string) => void;
  isWatched: (ticker: string) => boolean;
  /** The company whose card stays open (tapped, or found in the full map). */
  pinned: string | null;
  onPinnedChange: (ticker: string | null) => void;
  /** The full map: bigger bubbles, more labels, a finer grid and the medians. */
  expanded?: boolean;
  colorBy?: ColorBy;
  /** A search's matches: the rest is dimmed. */
  matches?: Set<string> | null;
  /** The zone in close-up, in the full map. */
  zoom?: HgZone | null;
  onZoom?: (zone: HgZone | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const overCard = useRef(false);
  const [size, setSize] = useState({ width: 0, height: MIN_HEIGHT });
  const { width } = size;
  const HEIGHT = size.height;
  const [hover, setHover] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<HgZone | null>(null);
  const setPinned = (next: string | null | ((t: string | null) => string | null)) =>
    onPinnedChange(typeof next === "function" ? next(pinned) : next);

  // Measured before paint, so the first frame is drawn at the right width
  // (the bubbles' entrance plays once, on real positions).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: Math.max(MIN_HEIGHT, el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view = zoom ? zoneView(zoom) : FULL_VIEW;
  const PAD = expanded ? PAD_FULL : PAD_CARD;
  // Companies are placed inside an inset of the plot, so one at an edge
  // (a yield clamped at the top of the scale) sits within the frame.
  const INSET = expanded ? 20 : 10;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (q: number) =>
    PAD.left + INSET + (((zoom ? q : Math.max(Q_MIN, q)) - view.q0) / (view.q1 - view.q0)) * (plotW - 2 * INSET);
  const yp = (pos: number) => PAD.top + INSET + (1 - (pos - view.p0) / (view.p1 - view.p0)) * (plotH - 2 * INSET);
  const y = (v: number) => yp(yPosition(v));
  const inView = (q: number, v: number) => {
    const pos = yPosition(v);
    return q >= view.q0 - 0.01 && q <= view.q1 + 0.01 && pos >= view.p0 - 0.001 && pos <= view.p1 + 0.001;
  };
  // Sized against the largest company in frame: in a close-up, the zone's,
  // so its biggest takes the full size rather than staying small beside a
  // giant that is not in the zone.
  const maxCap = Math.max(...points.filter((p) => !zoom || p.zone === zoom).map((p) => p.marketCap), 1);
  // Big enough to see and to hit: 5 to 20 px in the card, 8 to 30 in the
  // full map, 12 to 38 in a close-up, where there is room for it.
  const [rMin, rMax] = zoom ? [12, 38] : expanded ? [8, 30] : [5, 20];
  const radius = (cap: number) => rMin + (rMax - rMin) * Math.sqrt(cap / maxCap);
  const labelFrom = expanded ? 11 : 12;

  // Biggest first, so the small ones sit on top and stay reachable.
  const drawn = useMemo(() => [...points].sort((a, b) => b.marketCap - a.marketCap), [points]);
  const active = drawn.find((p) => p.ticker === (hover ?? pinned)) ?? null;
  const outOfFrame = (p: HgPoint) => zoom != null && (p.zone !== zoom || !inView(p.quality, p.fcfYield));

  // Where each bubble is drawn: where its figures put it, nudged just far
  // enough that it neither covers nor hides behind another (see separate).
  // Recomputed when the frame changes (the view, its size), not per render.
  const placed = useMemo(() => {
    if (width === 0) return new Map<string, { x: number; y: number }>();
    const inFrame = drawn.filter((p) => !outOfFrame(p));
    return separate(
      inFrame.map((p) => ({ id: p.ticker, x: x(p.quality), y: y(p.fcfYield), r: radius(p.marketCap) })),
      { left: PAD.left, top: PAD.top, right: PAD.left + plotW, bottom: PAD.top + plotH }
    );
    // x, y, radius and outOfFrame follow from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, zoom, expanded, width, HEIGHT, maxCap]);
  const at = (p: HgPoint) => placed.get(p.ticker) ?? { x: x(p.quality), y: y(p.fcfYield) };

  // Out of a close-up, the zone left behind: its companies glide back to
  // their places while the others, which were out of frame, take their
  // places unseen and then fade in, a ripple spreading out from that zone.
  // Flying them in from off the frame read as a burst.
  const [prevZoom, setPrevZoom] = useState(zoom);
  const [backFrom, setBackFrom] = useState<HgZone | null>(null);
  if (zoom !== prevZoom) {
    setPrevZoom(zoom);
    setBackFrom(zoom == null ? prevZoom : null);
  }
  useEffect(() => {
    if (!backFrom) return;
    const id = window.setTimeout(() => setBackFrom(null), BACK_MS);
    return () => window.clearTimeout(id);
  }, [backFrom]);

  // The medians of the companies in frame (the zone, in a close-up), for the full map's reference lines.
  const medians = useMemo(() => {
    if (!expanded) return null;
    const shown = points.filter((p) => (!sector || p.sector === sector) && (!zoom || p.zone === zoom));
    if (shown.length < 3) return null;
    return { quality: median(shown.map((p) => p.quality))!, fcfYield: median(shown.map((p) => p.fcfYield))! };
  }, [expanded, points, sector, zoom]);

  /**
   * A hovered card stays while the pointer is near its bubble (or on the
   * card itself, to reach its buttons) and closes once it moves away; a
   * tapped (pinned) card stays until closed.
   */
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // Which zone the pointer is over, in the full map: it lights up to say
    // it opens. A mouse only; a touch has no hover to light anything with.
    if (expanded && !zoom && onZoom && e.pointerType === "mouse") {
      const inPlot = px >= PAD.left && px <= PAD.left + plotW && py >= PAD.top && py <= PAD.top + plotH;
      const zone: HgZone | null = !inPlot
        ? null
        : px >= x(HG_RULES.QUALITY_LINE)
          ? py <= y(HG_RULES.CHEAP_YIELD) ? "prime" : "paying-up"
          : py <= y(HG_RULES.CHEAP_YIELD) ? "trap" : "avoid";
      if (zone !== hoverZone) setHoverZone(zone);
    }
    if (!hover || overCard.current) return;
    const p = drawn.find((d) => d.ticker === hover);
    if (!p) return;
    const c = at(p);
    if (Math.hypot(px - c.x, py - c.y) > radius(p.marketCap) + HOVER_SLACK) setHover(null);
  };

  const qx = x(HG_RULES.QUALITY_LINE);
  const qy = y(HG_RULES.CHEAP_YIELD);
  const plotRight = PAD.left + plotW;
  const plotBottom = PAD.top + plotH;
  // Zone backgrounds run past the frame in a close-up; the svg clips them.
  const zoneRect: Record<HgZone, { x: number; y: number; w: number; h: number }> = {
    prime: { x: qx, y: Math.min(PAD.top, yp(1)), w: Math.max(plotRight, x(100)) - qx, h: qy - Math.min(PAD.top, yp(1)) },
    "paying-up": { x: qx, y: qy, w: Math.max(plotRight, x(100)) - qx, h: Math.max(plotBottom, yp(0)) - qy },
    trap: { x: Math.min(PAD.left, x(Q_MIN)), y: Math.min(PAD.top, yp(1)), w: qx - Math.min(PAD.left, x(Q_MIN)), h: qy - Math.min(PAD.top, yp(1)) },
    avoid: { x: Math.min(PAD.left, x(Q_MIN)), y: qy, w: qx - Math.min(PAD.left, x(Q_MIN)), h: Math.max(plotBottom, yp(0)) - qy },
  };
  /** A returning company's fade-in delay: later the farther it sits from the zone left behind. */
  const backDelay = (c: { x: number; y: number }): number | null => {
    if (!backFrom) return null;
    const r = zoneRect[backFrom];
    const d = Math.hypot(c.x - (r.x + r.w / 2), c.y - (r.y + r.h / 2)) / Math.max(1, Math.hypot(plotW, plotH));
    return Math.round(BACK_FROM_MS + Math.min(1, d) * BACK_SPREAD_MS);
  };
  // A tick shows when it is in frame and, out of a close-up, on the coarse scale.
  const qTickShown = (t: number) => t >= view.q0 && t <= view.q1 && (zoom ? true : t % 20 === 0);
  const yTickShown = (t: number) => {
    const pos = yPosition(t);
    return pos >= view.p0 && pos <= view.p1 && (zoom ? true : (Y_TICKS as readonly number[]).includes(t));
  };
  const glide = (tx: number, ty: number, sx = 1, sy = 1) => ({ transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})` });

  return (
    <div
      ref={box}
      className={cn("relative h-full", hoverZone && !hover && "cursor-zoom-in")}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        overCard.current = false;
        setHover(null);
        setHoverZone(null);
      }}
    >
      {width > 0 ? (
        <svg width={width} height={HEIGHT} className="absolute inset-0 block" role="img" aria-label="Companies by quality score and free-cash-flow yield">
          {/* Zone backgrounds: unit squares placed and stretched by transform, so they glide with the camera. */}
          {ZONE_ORDER.map((zone) => {
            const r = zoneRect[zone];
            const clickable = expanded && !zoom && onZoom;
            return (
              <rect
                key={zone}
                x={0}
                y={0}
                width={1}
                height={1}
                className={cn("hg-glide hg-zone", clickable && "cursor-zoom-in")}
                style={{
                  ...glide(r.x, r.y, Math.max(0, r.w), Math.max(0, r.h)),
                  opacity: (zone === "prime" ? 0.09 : zoom && zone !== zoom ? 0.02 : 0.04) + (hoverZone === zone ? 0.07 : 0),
                }}
                fill={ZONE_FILL[zone]}
                onClick={clickable ? () => onZoom!(zone) : undefined}
              />
            );
          })}

          {expanded ? (
            <g className="pointer-events-none">
              {Q_TICKS.map((t) => (
                <line key={t} x1={0} x2={0} y1={PAD.top} y2={plotBottom} className="hg-glide" style={{ ...glide(x(t), 0), opacity: qTickShown(t) || (t % 10 === 0 && !zoom && t >= view.q0) ? 1 : 0 }} stroke="var(--color-mist)" strokeOpacity={0.08} />
              ))}
              {Y_TICKS_ALL.map((t) => (
                <line key={t} x1={PAD.left} x2={plotRight} y1={0} y2={0} className="hg-glide" style={{ ...glide(0, y(t)), opacity: yTickShown(t) ? 1 : 0 }} stroke="var(--color-mist)" strokeOpacity={0.08} />
              ))}
              {medians ? (
                <>
                  <g className="hg-glide" style={glide(x(medians.quality), 0)}>
                    <line x1={0} x2={0} y1={PAD.top} y2={plotBottom} stroke="var(--color-golden-hour)" strokeOpacity={0.45} strokeDasharray="1 4" />
                    <text x={0} y={plotBottom + 28} textAnchor="middle" className="fill-golden-hour/90 text-[10px]">
                      median {medians.quality}
                    </text>
                  </g>
                  <g className="hg-glide" style={glide(0, y(medians.fcfYield))}>
                    <line x1={PAD.left} x2={plotRight} y1={0} y2={0} stroke="var(--color-golden-hour)" strokeOpacity={0.45} strokeDasharray="1 4" />
                    <text x={plotRight + 6} y={-2} className="fill-golden-hour/90 text-[10px]">
                      median
                    </text>
                    <text x={plotRight + 6} y={10} className="fill-golden-hour/90 font-mono text-[10px]">
                      {formatPercent(medians.fcfYield, 1)}
                    </text>
                  </g>
                </>
              ) : null}
            </g>
          ) : null}

          {/* The split lines, and the axes' scales. */}
          <line x1={0} x2={0} y1={PAD.top} y2={plotBottom} className="hg-glide" style={glide(qx, 0)} stroke="var(--color-mist)" strokeOpacity={0.35} strokeDasharray="4 4" />
          <line x1={PAD.left} x2={plotRight} y1={0} y2={0} className="hg-glide" style={glide(0, qy)} stroke="var(--color-mist)" strokeOpacity={0.35} strokeDasharray="4 4" />
          {Y_TICKS_ALL.map((t) => (
            <text key={t} x={PAD.left - 6} y={3} textAnchor="end" className="hg-glide fill-mist/60 font-mono text-[9.5px]" style={{ ...glide(0, y(t)), opacity: yTickShown(t) ? 1 : 0 }}>
              {formatPercent(t, Math.round(t * 1000) % 10 === 0 ? 0 : 1)}
            </text>
          ))}
          {Q_TICKS.map((t) => (
            <text key={t} x={0} y={plotBottom + 14} textAnchor="middle" className="hg-glide fill-mist/60 font-mono text-[9.5px]" style={{ ...glide(x(t), 0), opacity: qTickShown(t) ? 1 : 0 }}>
              {t}
            </text>
          ))}
          <text x={plotRight} y={HEIGHT - 2} textAnchor="end" className="fill-mist text-[10.5px]">
            Huntr quality score →
          </text>
          <text x={10} y={PAD.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 10 ${PAD.top + plotH / 2})`} className="fill-mist text-[10.5px]">
            Cheaper: free-cash-flow yield →
          </text>

          {/* The zones' names, in the bands above and below the plot, never over a
              company. In the full map they open their zone (the hovered one says
              so); in a close-up they step aside for its title. */}
          {ZONE_ORDER.map((zone) => {
            const right = zone === "prime" || zone === "paying-up";
            const top = zone === "prime" || zone === "trap";
            const clickable = expanded && !zoom && onZoom;
            const lit = hoverZone === zone;
            return (
              <g
                key={zone}
                className={cn("hg-glide", clickable ? "cursor-zoom-in" : "pointer-events-none")}
                style={{ opacity: zoom ? 0 : 1 }}
                onClick={clickable ? () => onZoom!(zone) : undefined}
              >
                <text
                  x={right ? plotRight : PAD.left}
                  y={top ? PAD.top - 10 : plotBottom + (expanded ? 44 : 32)}
                  textAnchor={right ? "end" : "start"}
                  className="text-[12px] font-semibold"
                  style={{ fill: ZONE_FILL[zone] }}
                >
                  {right && lit ? <tspan className="fill-sunset-orange text-[11px] font-medium">Look closer → </tspan> : null}
                  {HG_ZONES[zone].label}
                  <tspan className="fill-mist font-mono text-[11px] font-normal"> {counts[zone]}</tspan>
                  <tspan className="fill-mist text-[10.5px] font-normal"> · {HG_ZONES[zone].line}</tspan>
                  {!right && lit ? <tspan className="fill-sunset-orange text-[11px] font-medium"> ← Look closer</tspan> : null}
                </text>
              </g>
            );
          })}

        </svg>
      ) : null}

      {/* The companies, as HTML over the svg: each bubble is placed and sized
          by one transform (translate3d and scale), which the compositor
          animates on its own, so a hundred and more glide together without
          a stutter (in svg every frame was repainted on the main thread).
          Names are separate elements, never scaled, so they stay crisp. */}
      {width > 0 ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: `inset(${PAD.top - 6}px ${PAD.right - 6}px ${PAD.bottom - 6}px ${PAD.left - 6}px)` }}>
          {drawn.map((p, i) => {
            const r = radius(p.marketCap);
            const c = at(p);
            const scale = r / DOT_R;
            const fill = colorBy === "sector" ? { color: sectorColor(p.sector), opacity: 0.8 } : moveFill(p.change);
            const gone = outOfFrame(p);
            const dim = (sector != null && p.sector !== sector) || (matches != null && !matches.has(p.ticker));
            const isActive = active?.ticker === p.ticker;
            const back = p.zone !== backFrom ? backDelay(c) : null;
            return (
              <div
                key={p.ticker}
                className={cn(
                  "hg-dot absolute left-0 top-0",
                  expanded && "hg-dot-live",
                  back != null && "is-back",
                  gone || dim ? "pointer-events-none" : "pointer-events-auto cursor-pointer"
                )}
                style={{
                  transform: `translate3d(${c.x}px, ${c.y}px, 0) scale(${scale})`,
                  opacity: gone ? 0 : dim ? 0.1 : 1,
                  zIndex: isActive ? 2 : undefined,
                  "--hg-back": back != null ? `${back}ms` : undefined,
                } as React.CSSProperties}
                onPointerEnter={() => !dim && !gone && setHover(p.ticker)}
                onClick={() => !dim && !gone && setPinned((t) => (t === p.ticker ? null : p.ticker))}
              >
                <span
                  className="hg-dot-body"
                  style={{
                    "--hg-delay": `${Math.min(i * 3, 450)}ms`,
                    background: `color-mix(in srgb, ${fill.color} ${Math.round(fill.opacity * 100)}%, transparent)`,
                    // Outlines in screen pixels whatever the scale: the surface's
                    // edge always, and a white ring for the company whose card is open.
                    boxShadow: isActive
                      ? `0 0 0 ${1 / scale}px var(--color-wolf-surface), 0 0 0 ${3 / scale}px var(--color-snow-peak)`
                      : `0 0 0 ${1 / scale}px var(--color-wolf-surface)`,
                  } as React.CSSProperties}
                />
              </div>
            );
          })}

          {drawn.map((p) => {
            const r = radius(p.marketCap);
            const c = at(p);
            const gone = outOfFrame(p);
            const dim = (sector != null && p.sector !== sector) || (matches != null && !matches.has(p.ticker));
            // In a close-up every company is named: inside a big bubble, beside a small one.
            const inside = r >= (zoom ? 12 : labelFrom);
            const shown = !gone && !dim && (zoom ? true : r >= labelFrom);
            const back = p.zone !== backFrom ? backDelay(c) : null;
            return (
              <span
                key={p.ticker}
                className={cn(
                  "hg-label absolute left-0 top-0 whitespace-nowrap font-mono font-semibold",
                  shown && "is-on",
                  back != null && "is-back",
                  inside ? "text-snow-peak" : "text-snow-peak/75",
                  inside && r < 14 ? "text-[7.5px]" : zoom && r >= 22 ? "text-[10.5px]" : "text-[9px]"
                )}
                style={{
                  transform: inside
                    ? `translate3d(${c.x}px, ${c.y}px, 0) translate(-50%, -50%)`
                    : `translate3d(${c.x + r + 3}px, ${c.y}px, 0) translateY(-50%)`,
                  "--hg-back": back != null ? `${back}ms` : undefined,
                } as React.CSSProperties}
                aria-hidden
              >
                {p.ticker}
              </span>
            );
          })}
        </div>
      ) : null}

      {zoom && onZoom ? (
        <div
          key={zoom}
          className="hg-zoom-title pointer-events-auto absolute z-[5] flex items-center gap-2 rounded-lg bg-wolf-surface/90 px-2.5 py-1 ring-1 ring-inset ring-wolf-border/60 backdrop-blur"
          style={{ left: PAD.left, top: 4 }}
        >
          <button type="button" onClick={() => onZoom(null)} className="inline-flex items-center gap-1 text-[11.5px] text-mist transition-colors duration-150 hover:text-snow-peak">
            <ArrowLeft className="h-3.5 w-3.5" /> All zones
          </button>
          <span className="h-3 w-px bg-wolf-border/70" aria-hidden />
          <span className="text-[12.5px] font-semibold" style={{ color: ZONE_FILL[zoom] }}>
            {HG_ZONES[zoom].label}
          </span>
          <span className="font-mono text-[11px] text-mist">{counts[zoom]}</span>
        </div>
      ) : null}

      {active ? (
        <CompanyCard
          point={active}
          inNews={newsTickers.has(active.ticker)}
          anchor={{ ...at(active), r: radius(active.marketCap) }}
          bounds={{ width, height: HEIGHT }}
          pinned={pinned === active.ticker}
          onClose={() => setPinned(null)}
          watched={isWatched(active.ticker)}
          onWatch={() => onWatch(active.ticker)}
          onPointerEnter={() => {
            overCard.current = true;
          }}
          onPointerLeave={() => {
            overCard.current = false;
          }}
        />
      ) : null}
    </div>
  );
}

/** A bubble's base radius; each is drawn at this size and scaled to its own. */
const DOT_R = 20;

/**
 * The way back out of a close-up: the first returning company starts to
 * fade in as the zone's own settle (the camera's 500 ms), the farthest
 * BACK_SPREAD_MS later, each over the CSS's 560 ms. BACK_MS covers it all.
 */
const BACK_FROM_MS = 260;
const BACK_SPREAD_MS = 420;
const BACK_MS = 1400;

/** The company under the pointer (or tapped): what it is, why it sits there, the way to its page. */
function CompanyCard({
  point,
  inNews,
  anchor,
  bounds,
  pinned,
  onClose,
  watched,
  onWatch,
  onPointerEnter,
  onPointerLeave,
}: {
  point: HgPoint;
  inNews: boolean;
  anchor: { x: number; y: number; r: number };
  bounds: { width: number; height: number };
  pinned: boolean;
  onClose: () => void;
  watched: boolean;
  onWatch: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // Measured before paint, so the card appears in its place, not first at a guess.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setSize({ width: el.offsetWidth, height: el.offsetHeight });
  }, [point.ticker, inNews, pinned]);
  const position = size ? placeCard(anchor, size, bounds) : null;
  const multiple = point.fcfYield > 0 ? 1 / point.fcfYield : null;
  const dims = [
    { label: "Profitability", value: point.profitability },
    { label: "Financial health", value: point.financialHealth },
    { label: "Growth", value: point.growth },
    { label: "Cash generation", value: point.cashGeneration },
  ];
  return (
    <div
      ref={ref}
      className="hg-card absolute z-10 w-[16.5rem] rounded-xl bg-wolf-black/95 p-3.5 shadow-2xl ring-1 ring-inset ring-wolf-border/70 backdrop-blur"
      style={position ? { left: position.left, top: position.top } : { left: 0, top: 0, visibility: "hidden" }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="flex items-center gap-2.5">
        <TickerLogo ticker={point.ticker} src={point.logo} className="h-8 w-8" imageClassName="rounded-lg" fallbackClassName="rounded-lg text-[9px]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-tight text-snow-peak">{point.ticker}</p>
          <p className="truncate text-[11px] text-mist">
            {point.name}
            {point.otherClasses.length > 0 ? ` · also ${point.otherClasses.join(", ")}` : ""}
          </p>
        </div>
        <span className={cn("font-mono text-[12.5px] font-semibold tabular-nums", point.change >= 0 ? "text-bullish" : "text-bearish")}>
          {signed(point.change)}
        </span>
        {pinned ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-6 w-6 items-center justify-center rounded-md text-mist transition-colors duration-150 hover:bg-snow-peak/[0.06] hover:text-snow-peak"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset" style={{ color: ZONE_FILL[point.zone], borderColor: ZONE_FILL[point.zone] }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: ZONE_FILL[point.zone] }} />
        {HG_ZONES[point.zone].label}
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10.5px] text-mist">Quality</p>
          <p className="font-mono text-[18px] font-semibold tabular-nums text-snow-peak">
            {point.quality}
            <span className="text-[11px] text-mist">/100</span>
          </p>
        </div>
        <div>
          <p className="text-[10.5px] text-mist">FCF yield</p>
          <p className="font-mono text-[18px] font-semibold tabular-nums text-snow-peak">{formatPercent(point.fcfYield, 1)}</p>
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-mist">
        {multiple ? `You pay ${Math.round(multiple)}× the cash it made last year.` : "It burned cash over the last year."}
        {point.fxFrom ? ` Its cash flow is reported in ${point.fxFrom}, converted at today's rate.` : ""}
      </p>

      <ul className="mt-2.5 space-y-1">
        {dims.map(({ label, value }) => (
          <li key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_1.5rem] items-center gap-2 text-[10.5px] text-mist">
            <span className="truncate">{label}</span>
            <span className="h-1 overflow-hidden rounded-full bg-snow-peak/[0.07]">
              {value != null ? <span className="block h-full rounded-full bg-sunset-orange/80" style={{ width: `${value}%` }} /> : null}
            </span>
            <span className="text-right font-mono tabular-nums">{value ?? "–"}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <Link
          href={ROUTES.SYMBOL(point.ticker)}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-sunset-orange px-3 py-1.5 text-[12px] font-semibold text-wolf-black transition-colors duration-150 hover:bg-sunset-orange/90"
        >
          Open {point.ticker} <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={onWatch}
          aria-label={watched ? `${point.ticker} is in a watchlist: edit` : `Add ${point.ticker} to a watchlist`}
          title={watched ? "In your watchlist" : "Add to watchlist"}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg ring-1 ring-inset ring-wolf-border/50 transition-colors duration-150 hover:bg-snow-peak/[0.05]"
        >
          <Star className={cn("h-3.5 w-3.5", watched ? "fill-sunset-orange text-sunset-orange" : "text-mist")} />
        </button>
      </div>
    </div>
  );
}

// ── The zones as lists (phones) ────────────────────────────────────────────

function ZoneLists({ points, sector, className }: { points: HgPoint[]; sector: string | null; className?: string }) {
  const shown = sector ? points.filter((p) => p.sector === sector) : points;
  return (
    <div className={cn("grid grid-cols-1 gap-2", className)}>
      {ZONE_ORDER.map((zone) => {
        const top = rankZone(shown, zone).slice(0, 4);
        return (
          <section key={zone} className="rounded-xl bg-snow-peak/[0.025] p-3 ring-1 ring-inset ring-wolf-border/40">
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] font-semibold" style={{ color: ZONE_FILL[zone] }}>
                {HG_ZONES[zone].label}
              </span>
              <span className="text-[11px] text-mist">{HG_ZONES[zone].line}</span>
            </p>
            {top.length === 0 ? (
              <p className="mt-2 text-[11.5px] text-mist/70">None right now.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {top.map((p) => (
                  <li key={p.ticker}>
                    <Link href={ROUTES.SYMBOL(p.ticker)} className="flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-snow-peak/[0.04]">
                      <TickerLogo ticker={p.ticker} src={p.logo} className="h-6 w-6" imageClassName="rounded-md" fallbackClassName="rounded-md text-[8px]" />
                      <span className="w-12 shrink-0 text-[12px] font-semibold text-snow-peak">{p.ticker}</span>
                      <span className="flex-1 truncate text-[11px] text-mist">
                        Quality {p.quality} · FCF {formatPercent(p.fcfYield, 1)}
                      </span>
                      <span className={cn("font-mono text-[11.5px] tabular-nums", p.change >= 0 ? "text-bullish" : "text-bearish")}>
                        {signed(p.change)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── The simple view ────────────────────────────────────────────────────────

/** Where each zone sits on the map, so the simple view keeps its geography. */
const GRID_ORDER: HgZone[] = ["trap", "prime", "avoid", "paying-up"];
const GRID_ROWS = 7;

/**
 * The same zones and data as the map, as four ranked lists in the map's
 * places: cheap on top, quality on the right. Each shows its count, its
 * best seven (furthest into its corner) and how many more.
 */
function ZoneGrid({
  points,
  sector,
  counts,
  className,
}: {
  points: HgPoint[];
  sector: string | null;
  counts: Record<HgZone, number>;
  className?: string;
}) {
  const shown = sector ? points.filter((p) => p.sector === sector) : points;
  return (
    <div className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-2", className)}>
      {GRID_ORDER.map((zone) => {
        const ranked = rankZone(shown, zone);
        return (
          <section
            key={zone}
            className="flex flex-col rounded-xl p-3 ring-1 ring-inset ring-wolf-border/40"
            style={{ background: `color-mix(in srgb, ${ZONE_FILL[zone]} ${zone === "prime" ? 9 : 4}%, transparent)` }}
          >
            <header className="flex items-baseline justify-between gap-2">
              <p className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-semibold" style={{ color: ZONE_FILL[zone] }}>
                  {HG_ZONES[zone].label}
                </span>
                <span className="font-mono text-[11.5px] text-mist">{counts[zone]}</span>
              </p>
              <span className="truncate text-[11px] text-mist">{HG_ZONES[zone].line}</span>
            </header>
            {ranked.length === 0 ? (
              <p className="mt-3 text-[11.5px] text-mist/70">None right now.</p>
            ) : (
              <ol className="mt-2 flex-1 space-y-0.5">
                {ranked.slice(0, GRID_ROWS).map((p) => (
                  <li key={p.ticker}>
                    <Link
                      href={ROUTES.SYMBOL(p.ticker)}
                      className="grid grid-cols-[1.5rem_3.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 rounded-lg px-1.5 py-1 transition-colors duration-150 hover:bg-snow-peak/[0.05]"
                    >
                      <TickerLogo ticker={p.ticker} src={p.logo} className="h-6 w-6" imageClassName="rounded-md" fallbackClassName="rounded-md text-[8px]" />
                      <span className="flex items-center gap-1 text-[12px] font-semibold text-snow-peak">
                        {p.ticker}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-mist">
                        <span className="shrink-0">Q {p.quality}</span>
                        <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-snow-peak/[0.08]">
                          <span className="block h-full rounded-full bg-sunset-orange/80" style={{ width: `${p.quality}%` }} />
                        </span>
                        <span className="truncate font-mono tabular-nums">FCF {formatPercent(p.fcfYield, 1)}</span>
                      </span>
                      <span className={cn("text-right font-mono text-[11.5px] tabular-nums", p.change >= 0 ? "text-bullish" : "text-bearish")}>
                        {signed(p.change)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {ranked.length > GRID_ROWS ? <p className="mt-1.5 px-1.5 text-[11px] text-mist/70">+{ranked.length - GRID_ROWS} more</p> : null}
          </section>
        );
      })}
    </div>
  );
}

// ── Loader ─────────────────────────────────────────────────────────────────

/** Fixed spots for the loader's dots: where companies tend to sit, scattered. */
const GHOST_DOTS = Array.from({ length: 34 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  const fx = a - Math.floor(a);
  const fy = b - Math.floor(b);
  return { x: 30 + fx * 62, y: 18 + fy * 70, r: 3 + ((i * 7) % 9), d: (i * 137) % 1800 };
});

/**
 * While the companies are placed: the ground itself, its four zones drawn
 * and empty, dots lighting up where companies will land, and a sweep
 * crossing it, a radar looking. It is a loading indicator, so it loops.
 */
function HuntingGroundLoader() {
  return (
    <div
      className="relative mt-3 min-h-[380px] flex-1 overflow-hidden rounded-xl bg-snow-peak/[0.015] ring-1 ring-inset ring-wolf-border/30"
      role="status"
      aria-label="Mapping the largest companies"
    >
      <span className="absolute inset-y-3 left-[55%] w-px border-l border-dashed border-mist/25" aria-hidden />
      <span className="absolute inset-x-3 top-[38%] h-px border-t border-dashed border-mist/25" aria-hidden />
      <span className="absolute right-0 top-0 h-[38%] w-[45%] bg-bullish/[0.04]" aria-hidden />
      {GHOST_DOTS.map((dot, i) => (
        <span
          key={i}
          className="hg-ghost-dot absolute rounded-full bg-mist"
          style={{
            left: `${dot.x}%`,
            top: `${dot.y}%`,
            width: dot.r * 2,
            height: dot.r * 2,
            "--d": `${dot.d}ms`,
          } as React.CSSProperties}
          aria-hidden
        />
      ))}
      <span className="hg-sweep absolute inset-y-0 w-[30%]" aria-hidden />
      <p className="absolute inset-x-0 bottom-4 text-center text-[12.5px] text-mist">Mapping the largest companies…</p>
    </div>
  );
}
