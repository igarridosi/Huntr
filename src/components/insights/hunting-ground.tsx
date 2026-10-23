"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Info, LayoutGrid, Maximize2, Newspaper, ScatterChart, Search, Star, Target, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TickerLogo } from "@/components/ui/ticker-logo";
import { SectionHeader } from "@/components/insights/section-header";
import { useStoredChoice } from "@/components/insights/use-stored-choice";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { ROUTES } from "@/lib/constants";
import { cn, formatPercent } from "@/lib/utils";
import { HG_RULES, HG_ZONES, placeCard, rankZone, yPosition, type HgPoint, type HgZone, type HuntingGround } from "@/lib/hunting-ground";

/** The chart's least height; beside a taller card it grows to fill the row. */
const MIN_HEIGHT = 380;
const PAD = { top: 12, right: 12, bottom: 30, left: 40 };
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
 * jumps. A dashed ring marks a company with a story in the news today. On a
 * phone, where a scatter cannot be read, each zone is a short list.
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
          icon={Target}
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
            <ZoneGrid points={points} sector={sector} counts={counts} newsTickers={newsTickers} className="mt-3 flex-1" />
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
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-sunset-orange" /> In the news
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
 * shown, and each zone's best beside the map. A native <dialog>, on the
 * same transitions as the news preview.
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
  const points = ground.points;

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
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
      className="hg-dialog m-auto h-[min(54rem,calc(100dvh-2rem))] w-[min(96rem,calc(100vw-2rem))] max-w-none overflow-visible bg-transparent p-0 text-snow-peak backdrop:bg-transparent"
    >
      <div className="flex h-full flex-col rounded-2xl bg-wolf-surface p-4 shadow-2xl ring-1 ring-inset ring-wolf-border/70 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sunset-orange/[0.08] ring-1 ring-inset ring-sunset-orange/25">
              <Target className="h-[18px] w-[18px] text-sunset-orange" />
            </span>
            <div>
              <p className="text-[16px] font-semibold leading-tight">The Hunting Ground</p>
              <p className="text-[11.5px] text-mist">{shown.length} companies · quality across, cheaper up, size is market cap</p>
            </div>
          </div>

          <label className="relative ml-auto flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-mist" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) setPinned(matches[0].ticker);
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

        <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
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
            />
          </div>
          <aside className="hidden min-h-0 flex-col gap-2 overflow-y-auto lg:flex" style={{ scrollbarWidth: "thin" }}>
            {GRID_ORDER.map((zone) => (
              <section key={zone} className="rounded-xl bg-snow-peak/[0.025] p-2.5 ring-1 ring-inset ring-wolf-border/40">
                <p className="flex items-baseline justify-between gap-2 px-1">
                  <span className="text-[12px] font-semibold" style={{ color: ZONE_FILL[zone] }}>
                    {HG_ZONES[zone].label}
                  </span>
                  <span className="font-mono text-[11px] text-mist">{counts[zone]}</span>
                </p>
                <ol className="mt-1">
                  {rankZone(shown, zone)
                    .slice(0, 5)
                    .map((p) => (
                      <li key={p.ticker}>
                        <button
                          type="button"
                          onClick={() => setPinned(p.ticker)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors duration-150 hover:bg-snow-peak/[0.05]",
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
        </div>
      </div>
    </dialog>
  );
}

// ── The scatter (sm and up) ────────────────────────────────────────────────

/** How far past a bubble's edge the pointer may go before its card closes. */
const HOVER_SLACK = 22;

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
}) {
  const box = useRef<HTMLDivElement>(null);
  const overCard = useRef(false);
  const [size, setSize] = useState({ width: 0, height: MIN_HEIGHT });
  const { width } = size;
  const HEIGHT = size.height;
  const [hover, setHover] = useState<string | null>(null);
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

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (q: number) => PAD.left + ((Math.max(Q_MIN, q) - Q_MIN) / (100 - Q_MIN)) * plotW;
  const y = (v: number) => PAD.top + (1 - yPosition(v)) * plotH;
  const maxCap = Math.max(...points.map((p) => p.marketCap));
  // 5 to 20 px in the card (6 to 28 at full size): big enough to see and to hit.
  const radius = (cap: number) => (expanded ? 6 + 22 * Math.sqrt(cap / maxCap) : 5 + 15 * Math.sqrt(cap / maxCap));
  const labelFrom = expanded ? 9 : 12;

  // Biggest first, so the small ones sit on top and stay reachable.
  const drawn = useMemo(() => [...points].sort((a, b) => b.marketCap - a.marketCap), [points]);
  const active = drawn.find((p) => p.ticker === (hover ?? pinned)) ?? null;

  // The medians of the companies shown, for the full map's reference lines.
  const medians = useMemo(() => {
    if (!expanded) return null;
    const shown = sector ? points.filter((p) => p.sector === sector) : points;
    if (shown.length < 3) return null;
    const mid = (vs: number[]) => {
      const s = [...vs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    return { quality: mid(shown.map((p) => p.quality)), fcfYield: mid(shown.map((p) => p.fcfYield)) };
  }, [expanded, points, sector]);

  /**
   * A hovered card stays while the pointer is near its bubble (or on the
   * card itself, to reach its buttons) and closes once it moves away; a
   * tapped (pinned) card stays until closed.
   */
  const onPointerMove = (e: React.PointerEvent) => {
    if (!hover || overCard.current) return;
    const p = drawn.find((d) => d.ticker === hover);
    const rect = box.current?.getBoundingClientRect();
    if (!p || !rect) return;
    const dx = e.clientX - rect.left - x(p.quality);
    const dy = e.clientY - rect.top - y(p.fcfYield);
    if (Math.hypot(dx, dy) > radius(p.marketCap) + HOVER_SLACK) setHover(null);
  };

  const qx = x(HG_RULES.QUALITY_LINE);
  const qy = y(HG_RULES.CHEAP_YIELD);
  const zoneRect: Record<HgZone, { x: number; y: number; w: number; h: number }> = {
    prime: { x: qx, y: PAD.top, w: PAD.left + plotW - qx, h: qy - PAD.top },
    "paying-up": { x: qx, y: qy, w: PAD.left + plotW - qx, h: PAD.top + plotH - qy },
    trap: { x: PAD.left, y: PAD.top, w: qx - PAD.left, h: qy - PAD.top },
    avoid: { x: PAD.left, y: qy, w: qx - PAD.left, h: PAD.top + plotH - qy },
  };

  return (
    <div
      ref={box}
      className="relative h-full"
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        overCard.current = false;
        setHover(null);
      }}
    >
      {width > 0 ? (
        <svg width={width} height={HEIGHT} className="absolute inset-0 block" role="img" aria-label="Companies by quality score and free-cash-flow yield">
          {ZONE_ORDER.map((zone) => {
            const r = zoneRect[zone];
            return <rect key={zone} x={r.x} y={r.y} width={Math.max(0, r.w)} height={Math.max(0, r.h)} fill={ZONE_FILL[zone]} opacity={zone === "prime" ? 0.09 : 0.04} />;
          })}

          {expanded ? (
            <g className="pointer-events-none">
              {[20, 30, 40, 50, 70, 80, 90].map((qv) => (
                <line key={qv} x1={x(qv)} x2={x(qv)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-mist)" strokeOpacity={0.08} />
              ))}
              {Y_TICKS.map((t) => (
                <line key={t} x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--color-mist)" strokeOpacity={0.08} />
              ))}
              {medians ? (
                <>
                  <line x1={x(medians.quality)} x2={x(medians.quality)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-golden-hour)" strokeOpacity={0.45} strokeDasharray="1 4" />
                  <line x1={PAD.left} x2={PAD.left + plotW} y1={y(medians.fcfYield)} y2={y(medians.fcfYield)} stroke="var(--color-golden-hour)" strokeOpacity={0.45} strokeDasharray="1 4" />
                  <text x={x(medians.quality) + 4} y={PAD.top + plotH - 4} className="fill-golden-hour/80 text-[10px]">
                    median {medians.quality}
                  </text>
                  <text x={PAD.left + 4} y={y(medians.fcfYield) - 4} className="fill-golden-hour/80 text-[10px]">
                    median {formatPercent(medians.fcfYield, 1)}
                  </text>
                </>
              ) : null}
            </g>
          ) : null}

          {/* The split lines, and the axes' scales. */}
          <line x1={qx} x2={qx} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-mist)" strokeOpacity={0.35} strokeDasharray="4 4" />
          <line x1={PAD.left} x2={PAD.left + plotW} y1={qy} y2={qy} stroke="var(--color-mist)" strokeOpacity={0.35} strokeDasharray="4 4" />
          {Y_TICKS.map((t) => (
            <text key={t} x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-mist/60 font-mono text-[9.5px]">
              {formatPercent(t, 0)}
            </text>
          ))}
          {[20, 40, 60, 80, 100].map((q) => (
            <text key={q} x={x(q)} y={HEIGHT - 14} textAnchor="middle" className="fill-mist/60 font-mono text-[9.5px]">
              {q}
            </text>
          ))}
          <text x={PAD.left + plotW} y={HEIGHT - 2} textAnchor="end" className="fill-mist text-[10.5px]">
            Huntr quality score →
          </text>
          <text x={10} y={PAD.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 10 ${PAD.top + plotH / 2})`} className="fill-mist text-[10.5px]">
            Cheaper: free-cash-flow yield →
          </text>

          {drawn.map((p, i) => {
            const r = radius(p.marketCap);
            const fill = colorBy === "sector" ? { color: sectorColor(p.sector), opacity: 0.8 } : moveFill(p.change);
            const dim = (sector != null && p.sector !== sector) || (matches != null && !matches.has(p.ticker));
            const cx = x(p.quality);
            const cy = y(p.fcfYield);
            return (
              <g
                key={p.ticker}
                className="hg-bubble cursor-pointer"
                style={{ "--hg-delay": `${Math.min(i * 3, 450)}ms`, opacity: dim ? 0.1 : 1 } as React.CSSProperties}
                onPointerEnter={() => !dim && setHover(p.ticker)}
                onClick={() => !dim && setPinned((t) => (t === p.ticker ? null : p.ticker))}
              >
                {/* A wider, invisible target than the bubble itself. */}
                <circle cx={cx} cy={cy} r={r + 4} fill="transparent" />
                {/* Bubble, ring and label move as one, scaled about their shared centre. */}
                <g className="hg-bubble-body">
                  <circle cx={cx} cy={cy} r={r} fill={fill.color} fillOpacity={fill.opacity} stroke="var(--color-wolf-surface)" strokeWidth={1} />
                  {newsTickers.has(p.ticker) ? <NewsRing cx={cx} cy={cy} r={r + 4} /> : null}
                  {r >= labelFrom ? (
                    <text
                      x={cx}
                      y={cy + 3}
                      textAnchor="middle"
                      className={cn("pointer-events-none fill-snow-peak font-mono font-semibold", r < 12 ? "text-[7.5px]" : "text-[9px]")}
                    >
                      {p.ticker}
                    </text>
                  ) : null}
                </g>
              </g>
            );
          })}

          {/* The zones' names, over the bubbles, outlined in the card's colour so they read. */}
          {ZONE_ORDER.map((zone) => {
            const r = zoneRect[zone];
            const right = zone === "prime" || zone === "paying-up";
            const top = zone === "prime" || zone === "trap";
            const halo = { paintOrder: "stroke", stroke: "var(--color-wolf-surface)", strokeWidth: 4, strokeLinejoin: "round" } as React.CSSProperties;
            return (
              <g key={zone} className="pointer-events-none">
                <text
                  x={right ? r.x + r.w - 8 : r.x + 8}
                  y={top ? r.y + 16 : r.y + r.h - 20}
                  textAnchor={right ? "end" : "start"}
                  className="text-[12px] font-semibold"
                  style={{ ...halo, fill: ZONE_FILL[zone] }}
                >
                  {HG_ZONES[zone].label}
                  <tspan className="fill-mist font-mono text-[11px] font-normal"> · {counts[zone]}</tspan>
                </text>
                <text
                  x={right ? r.x + r.w - 8 : r.x + 8}
                  y={top ? r.y + 30 : r.y + r.h - 6}
                  textAnchor={right ? "end" : "start"}
                  className="fill-mist text-[10.5px]"
                  style={halo}
                >
                  {HG_ZONES[zone].line}
                </text>
              </g>
            );
          })}

          {active ? (
            <circle
              cx={x(active.quality)}
              cy={y(active.fcfYield)}
              r={radius(active.marketCap) + 2}
              fill="none"
              stroke="var(--color-snow-peak)"
              strokeWidth={2}
              className="pointer-events-none"
            />
          ) : null}
        </svg>
      ) : null}

      {active ? (
        <CompanyCard
          point={active}
          inNews={newsTickers.has(active.ticker)}
          anchor={{ x: x(active.quality), y: y(active.fcfYield), r: radius(active.marketCap) }}
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

/**
 * The "in the news" ring: dashes that divide the circle evenly, so no gap
 * falls where a dash should and the ring reads as centred on its bubble.
 */
function NewsRing({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const circumference = 2 * Math.PI * r;
  const dashes = Math.max(8, Math.round(circumference / 6));
  const step = circumference / dashes;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke="var(--color-sunset-orange)"
      strokeWidth={1.5}
      strokeDasharray={`${(step * 0.6).toFixed(2)} ${(step * 0.4).toFixed(2)}`}
      className="pointer-events-none"
    />
  );
}

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

      {inNews ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-sunset-orange">
          <Newspaper className="h-3.5 w-3.5" /> In today&apos;s news, above
        </p>
      ) : null}

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
  newsTickers,
  className,
}: {
  points: HgPoint[];
  sector: string | null;
  counts: Record<HgZone, number>;
  newsTickers: Set<string>;
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
                        {newsTickers.has(p.ticker) ? <Newspaper className="h-3 w-3 text-sunset-orange" aria-label="In today's news" /> : null}
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
