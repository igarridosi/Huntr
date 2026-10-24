"use client";

import { useMemo, useRef, useState } from "react";
import { CircleHelp, Gauge } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { SectionHeader } from "@/components/insights/section-header";
import { useFearGreed } from "@/hooks/use-stock-data";
import { cn } from "@/lib/utils";
import {
  extremesOf,
  FEAR_GREED_COMPONENTS,
  FEAR_GREED_ZONES,
  pointsIn,
  zoneOf,
  type FearGreedComponent,
  type FearGreedPoint,
  type FearGreedRange,
  type FearGreedZone,
} from "@/lib/fear-greed";

/** One colour per zone, from the theme: red through mist to green. */
const ZONE_COLOR: Record<FearGreedZone, string> = {
  "extreme-fear": "var(--color-bearish)",
  fear: "var(--color-sunset-orange)",
  neutral: "var(--color-mist)",
  greed: "var(--color-glacier)",
  "extreme-greed": "var(--color-bullish)",
};

const colorOf = (value: number) => ZONE_COLOR[zoneOf(value).zone];

const RANGES = [
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "YTD", label: "YTD" },
] as const;

/** What each signal measures, and which way is fear, in plain words. */
const EXPLAIN: Record<FearGreedComponent, string> = {
  momentum:
    "How far the S&P 500 sits above or below its average of the last 125 trading days (about six months). Well above it, investors are chasing the rally: greed. Below it, they are selling: fear.",
  volatility:
    "The VIX is how much movement option traders expect over the next month. Above its 50-day average, investors are paying up for protection: fear. Low and calm: greed.",
  junk:
    "High-yield bonds (HYG) against safe Treasuries (IEF) over 20 days. Buying risky debt means investors are comfortable with risk: greed. Running to Treasuries: fear.",
  safeHaven:
    "Stocks (SPY) against long-term government bonds (TLT) over 20 days. Money leaving stocks for bonds is looking for safety: fear.",
  breadth:
    "The average stock (the equal-weight S&P 500, RSP) against the index its giants lead (SPY) over 20 days. When most stocks join in, the move is broad: greed. When a few giants carry it: fear.",
};

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Huntr's Fear & Greed index (src/lib/fear-greed.ts): today's reading on a
 * gauge, against yesterday, last week and last month; the mood over the
 * week, month or year as one stripe per day under a line that zooms to the
 * range; and the five signals behind the number, each with its month and
 * what it means, so the number is never a black box.
 */
export function FearGreedCard({ className }: { className?: string }) {
  const { data, isLoading, isError } = useFearGreed();
  const [range, setRange] = useState<FearGreedRange>("1M");
  const points = useMemo(() => data?.points ?? [], [data]);
  const latest = points.at(-1);

  return (
    <Card id="fear-greed" className={cn("scroll-mt-20", className)}>
      <CardContent className="flex h-full flex-col p-4 sm:p-5">
        <SectionHeader
          icon={Gauge}
          title="Fear & Greed"
          subtitle={latest ? `How investors feel · close of ${dayLabel(latest.date)}` : "How investors feel"}
        />

        {isLoading ? (
          <FearGreedLoader />
        ) : isError || !latest ? (
          <p className="mt-6 text-[13px] text-mist">The index could not be computed right now. It comes back with the next market data.</p>
        ) : (
          <>
            <Dial point={latest} />
            <Comparisons points={points} />
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-mist">History</span>
              <SegmentedTabs items={RANGES} value={range} onChange={setRange} ariaLabel="Fear & Greed range" size="sm" />
            </div>
            <History points={pointsIn(points, range)} range={range} />
            <Signals points={points.slice(-22)} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Dial ───────────────────────────────────────────────────────────────────

const CX = 120;
const CY = 112;
const R = 92;

const polar = (value: number, radius = R) => {
  const a = Math.PI * (1 - value / 100);
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) };
};

function arc(from: number, to: number, radius = R) {
  const a = polar(from, radius);
  const b = polar(to, radius);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y}`;
}

/** Degrees the needle turns from straight up (50) to point at a value. */
const needleAngle = (value: number) => value * 1.8 - 90;

function DialFace({ litZone }: { litZone?: FearGreedZone }) {
  return (
    <>
      {FEAR_GREED_ZONES.map((z) => (
        <path
          key={z.zone}
          d={arc(z.from + 0.8, Math.min(100, z.to) - 0.8)}
          fill="none"
          stroke={ZONE_COLOR[z.zone]}
          strokeWidth={14}
          opacity={litZone == null ? 0.16 : z.zone === litZone ? 1 : 0.2}
        />
      ))}
      {/* Fine ticks every 5, as on an instrument. */}
      {Array.from({ length: 21 }, (_, i) => i * 5).map((v) => {
        const a = polar(v, R - 11);
        const b = polar(v, R - (v % 25 === 0 ? 18 : 14));
        return <line key={v} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-mist)" strokeOpacity={v % 25 === 0 ? 0.6 : 0.3} strokeWidth={1} />;
      })}
      {[0, 25, 50, 75, 100].map((v) => {
        const p = polar(v, R - 27);
        return (
          <text key={v} x={p.x} y={p.y + 3} textAnchor="middle" className="fill-mist/70 font-mono text-[8px]">
            {v}
          </text>
        );
      })}
    </>
  );
}

/**
 * The gauge. The needle's angle is an SVG attribute, so it points right
 * whatever the stylesheet does; the stylesheet only adds its entrance, a
 * swing in from fear, once, when the data arrives.
 */
function Dial({ point }: { point: FearGreedPoint }) {
  const zone = zoneOf(point.value);
  const angle = needleAngle(point.value);
  return (
    <div className="mt-3 flex flex-col items-center">
      <svg viewBox="0 0 240 124" className="w-full max-w-[17rem]" role="img" aria-label={`Fear & Greed at ${point.value}: ${zone.label}`}>
        <DialFace litZone={zone.zone} />
        <g transform={`rotate(${angle} ${CX} ${CY})`}>
          <g className="fg-needle-in" style={{ "--fg-from": `${-90 - angle}deg` } as React.CSSProperties}>
            <path d={`M ${CX - 3} ${CY} L ${CX} ${CY - R + 8} L ${CX + 3} ${CY} Z`} fill="var(--color-snow-peak)" />
          </g>
        </g>
        <circle cx={CX} cy={CY} r={7} fill="var(--color-snow-peak)" />
        <circle cx={CX} cy={CY} r={3} fill={ZONE_COLOR[zone.zone]} />
      </svg>
      <p className="-mt-1 font-mono text-[34px] font-semibold leading-none tabular-nums" style={{ color: ZONE_COLOR[zone.zone] }}>
        {point.value}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-snow-peak">{zone.label}</p>
    </div>
  );
}

function Comparisons({ points }: { points: FearGreedPoint[] }) {
  const now = points.at(-1)!.value;
  const items = [
    { label: "Yesterday", point: points.at(-2) },
    { label: "Last week", point: points.at(-6) },
    { label: "Last month", point: points.at(-22) },
  ];
  return (
    <div className="mt-4 grid grid-cols-3 gap-1.5">
      {items.map(({ label, point }) => {
        if (!point) return null;
        const delta = now - point.value;
        return (
          <div key={label} className="rounded-lg bg-snow-peak/[0.025] px-2 py-1.5 text-center ring-1 ring-inset ring-wolf-border/40">
            <p className="truncate text-[10.5px] text-mist">{label}</p>
            <p className="mt-0.5 flex items-center justify-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(point.value) }} aria-hidden />
              <span className="font-mono text-[13px] font-semibold tabular-nums text-snow-peak">{point.value}</span>
              {delta !== 0 ? (
                <span
                  className={cn("font-mono text-[10.5px] tabular-nums", delta > 0 ? "text-bullish" : "text-bearish")}
                  title={`Today is ${Math.abs(delta)} points ${delta > 0 ? "greedier" : "more fearful"}`}
                >
                  {delta > 0 ? "▲" : "▼"}
                  {Math.abs(delta)}
                </span>
              ) : null}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── History: mood stripes under a zoomed line ──────────────────────────────

const H_W = 400;
const H_H = 132;

/**
 * The mood over the range. Each day is a stripe in its zone's colour, deeper
 * the further from neutral, so a fearful stretch reads as a red band at a
 * glance (the way climate stripes show warming). Over it, the line zooms to
 * the range's own span, so a week that moved from 35 to 26 looks like a
 * fall, not a flat line on a 0-100 scale. The zone edges inside the span are
 * marked; the high and low are pinned; hover reads any day.
 */
function History({ points, range }: { points: FearGreedPoint[]; range: FearGreedRange }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const extremes = extremesOf(points);
  if (points.length < 2 || !extremes) return null;

  // Zoomed: the range's span with room above and below, at least 20 points tall.
  const pad = 6;
  let lo = Math.max(0, extremes.low.value - pad);
  let hi = Math.min(100, extremes.high.value + pad);
  if (hi - lo < 20) {
    const mid = (hi + lo) / 2;
    lo = Math.max(0, Math.min(80, mid - 10));
    hi = lo + 20;
  }

  const n = points.length;
  const step = H_W / n;
  const x = (i: number) => step * (i + 0.5);
  const y = (v: number) => H_H - ((v - lo) / (hi - lo)) * H_H;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const pct = (i: number) => `${((i + 0.5) / n) * 100}%`;
  const top = (v: number) => `${((hi - v) / (hi - lo)) * 100}%`;
  const edges = [25, 45, 55, 75].filter((v) => v > lo && v < hi);
  const showDots = range !== "YTD";
  const shown = hover != null ? points[hover] : null;
  const hiIdx = points.indexOf(extremes.high);
  const loIdx = points.indexOf(extremes.low);

  return (
    <div
      ref={box}
      className="relative mt-2 h-[8.5rem] select-none overflow-hidden rounded-lg ring-1 ring-inset ring-wolf-border/30"
      onPointerMove={(e) => {
        const rect = box.current?.getBoundingClientRect();
        if (!rect) return;
        const t = Math.min(0.9999, Math.max(0, (e.clientX - rect.left) / rect.width));
        setHover(Math.floor(t * n));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${H_W} ${H_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={i * step}
            width={step + 0.6}
            y={0}
            height={H_H}
            fill={colorOf(p.value)}
            opacity={Math.min(0.75, (0.1 + 0.32 * Math.min(1, Math.abs(p.value - 50) / 40)) * (hover === i ? 1.6 : 1))}
          />
        ))}
        {edges.map((v) => (
          <line key={v} x1={0} x2={H_W} y1={y(v)} y2={y(v)} stroke="var(--color-snow-peak)" strokeOpacity={0.18} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {/* The line on its own layer, revealed left to right by a clip on this
          box. It used to draw in with a dash over pathLength, which a
          non-scaling stroke measures in screen units on a stretched chart:
          the dash ended short and the line stopped before the last points. */}
      <div key={`${range}-${points[0].date}-${n}`} className="fg-history-reveal pointer-events-none absolute inset-0">
        <svg viewBox={`0 0 ${H_W} ${H_H}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          <path
            d={line}
            fill="none"
            stroke="var(--color-snow-peak)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Zone edges inside the span, labelled at the right. */}
      {edges.map((v) => (
        <span key={v} className="pointer-events-none absolute right-1.5 -translate-y-1/2 font-mono text-[9px] text-snow-peak/45" style={{ top: top(v) }}>
          {v}
        </span>
      ))}

      {showDots
        ? points.map((p, i) => (
            <span
              key={p.date}
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-wolf-surface"
              style={{ left: pct(i), top: top(p.value), background: colorOf(p.value) }}
            />
          ))
        : null}

      {/* The high's label sits above its point and the low's below, unless the
          point is near that edge: then the label goes inside, so it is never
          cut off by the box. */}
      {[
        { i: hiIdx, p: extremes.high, high: true },
        { i: loIdx, p: extremes.low, high: false },
      ].map(({ i, p, high }) => {
        const fromTop = (hi - p.value) / (hi - lo);
        const below = high ? fromTop < 0.25 : fromTop < 0.75;
        return (
          <span
            key={high ? "hi" : "lo"}
            className={cn(
              "pointer-events-none absolute z-[1] whitespace-nowrap rounded bg-wolf-black/80 px-1 font-mono text-[9.5px] tabular-nums text-snow-peak/90",
              below ? "translate-y-[45%]" : "-translate-y-[145%]",
              i > n * 0.75 ? "-translate-x-full" : i < n * 0.25 ? "" : "-translate-x-1/2"
            )}
            style={{ left: pct(i), top: top(p.value) }}
          >
            {high ? "High" : "Low"} {p.value} · {dayLabel(p.date)}
          </span>
        );
      })}

      {shown && hover != null ? (
        <>
          <span className="pointer-events-none absolute inset-y-0 w-px bg-snow-peak/40" style={{ left: pct(hover) }} />
          <span
            className="pointer-events-none absolute bottom-1.5 z-10 whitespace-nowrap rounded-md bg-wolf-black/90 px-2 py-1 text-[11px] text-snow-peak ring-1 ring-inset ring-wolf-border/60"
            style={hover > n / 2 ? { right: `calc(100% - ${pct(hover)} + 6px)` } : { left: `calc(${pct(hover)} + 6px)` }}
          >
            <span className="text-mist">{dayLabel(shown.date)}</span>{" "}
            <span className="font-mono font-semibold tabular-nums" style={{ color: colorOf(shown.value) }}>
              {shown.value}
            </span>{" "}
            {zoneOf(shown.value).label}
          </span>
        </>
      ) : null}
    </div>
  );
}

// ── Signals ────────────────────────────────────────────────────────────────

const SIGNAL_GRID =
  "grid grid-cols-[6.25rem_minmax(0,1fr)_1.75rem] gap-2.5 @[22rem]:grid-cols-[6.75rem_minmax(0,1fr)_3.5rem_1.75rem]";

/**
 * The five signals as instruments: where each reads today on a track of the
 * five zones, how it moved over the last month (a sparkline), and, behind
 * the help mark, what it measures and which way is fear.
 */
function Signals({ points }: { points: FearGreedPoint[] }) {
  const today = points.at(-1)!;
  return (
    // A container query: the month's sparkline shows only where there is room
    // for it beside a track still wide enough to read.
    <div className="@container mt-5 border-t border-wolf-border/30 pt-3">
      <div className={cn(SIGNAL_GRID, "items-end")}>
        <p className="col-span-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-mist">Behind the number</p>
        <p className="hidden text-center text-[9.5px] text-mist/60 @[22rem]:block">Last month</p>
        <p className="text-right text-[9.5px] text-mist/60">Today</p>
      </div>
      <ul className="mt-2 space-y-2">
        {FEAR_GREED_COMPONENTS.map(({ key, label }) => {
          const value = today.components[key];
          const series = points.map((p) => p.components[key]).filter((v): v is number => v != null);
          return (
            <li key={key} className={cn(SIGNAL_GRID, "items-center")}>
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate text-[12px] text-snow-peak/85">{label}</span>
                <InfoTip label={label} text={EXPLAIN[key]} />
              </span>
              <ZoneTrack value={value} />
              <span className="hidden @[22rem]:block">
                <Sparkline values={series} />
              </span>
              <span className="text-right font-mono text-[12px] font-semibold tabular-nums" style={{ color: value != null ? colorOf(value) : undefined }}>
                {value ?? "–"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[10.5px] leading-snug text-mist/70">
        Each signal is scored against its own past year: 0 is its most fearful reading of the year, 100 its greediest.
      </p>
    </div>
  );
}

function ZoneTrack({ value }: { value: number | undefined }) {
  return (
    <span className="relative flex h-2 items-center gap-[2px]">
      {FEAR_GREED_ZONES.map((z) => (
        <span
          key={z.zone}
          className="h-full rounded-[2px]"
          style={{
            width: `${Math.min(100, z.to) - z.from}%`,
            background: ZONE_COLOR[z.zone],
            opacity: value != null && zoneOf(value).zone === z.zone ? 0.9 : 0.22,
          }}
        />
      ))}
      {value != null ? (
        <span
          className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-snow-peak shadow-[0_0_0_2px_var(--color-wolf-surface)]"
          style={{ left: `${value}%` }}
        />
      ) : null}
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span />;
  const w = 56;
  const h = 18;
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - (v / 100) * h).toFixed(1)}`).join(" ");
  const last = values.at(-1)!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[18px] w-full overflow-visible" aria-hidden>
      <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="var(--color-mist)" strokeOpacity={0.25} strokeDasharray="2 3" />
      <path d={d} fill="none" stroke={colorOf(last)} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={h - (last / 100) * h} r={2} fill={colorOf(last)} />
    </svg>
  );
}

/** A help mark that shows its text on hover or keyboard focus. */
function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={`What ${label} measures`}
        className="-m-1 inline-flex cursor-help items-center justify-center rounded p-1 text-mist/50 transition-colors hover:text-snow-peak focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sunset-orange"
      >
        <CircleHelp className="h-3 w-3" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-6 left-0 z-20 w-64 rounded-lg bg-wolf-black/95 p-2.5 text-[11px] leading-relaxed text-mist opacity-0 shadow-xl ring-1 ring-inset ring-wolf-border/60 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="mb-1 block font-semibold text-snow-peak">{label}</span>
        {text}
      </span>
    </span>
  );
}

// ── Loader ─────────────────────────────────────────────────────────────────

/**
 * While the index is computed: the dial itself, unlit, with its needle
 * sweeping slowly across the zones (a reading being taken), and the shapes
 * of what follows, so the card arrives without a jump.
 */
function FearGreedLoader() {
  return (
    <div className="mt-3 flex flex-1 flex-col" role="status" aria-label="Reading the market's mood">
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 240 124" className="w-full max-w-[17rem]" aria-hidden>
          <DialFace />
          <g className="fg-needle-sweep">
            <path d={`M ${CX - 3} ${CY} L ${CX} ${CY - R + 8} L ${CX + 3} ${CY} Z`} fill="var(--color-mist)" opacity={0.6} />
          </g>
          <circle cx={CX} cy={CY} r={7} fill="var(--color-mist)" opacity={0.6} />
        </svg>
        <p className="mt-1 text-[12.5px] text-mist">Reading the market&apos;s mood…</p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[46px] rounded-lg bg-snow-peak/[0.025] ring-1 ring-inset ring-wolf-border/40" />
        ))}
      </div>
      <div className="fg-stripes-ghost mt-10 flex h-[8.5rem] overflow-hidden rounded-lg ring-1 ring-inset ring-wolf-border/30" aria-hidden>
        {Array.from({ length: 22 }, (_, i) => (
          <span key={i} className="h-full flex-1" style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <ul className="mt-5 space-y-3 border-t border-wolf-border/30 pt-4" aria-hidden>
        {FEAR_GREED_COMPONENTS.map(({ key }) => (
          <li key={key} className="flex items-center gap-2.5">
            <span className="h-2 w-24 rounded bg-snow-peak/[0.06]" />
            <span className="h-2 flex-1 rounded bg-snow-peak/[0.04]" />
          </li>
        ))}
      </ul>
    </div>
  );
}
