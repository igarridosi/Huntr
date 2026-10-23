"use client";

import { useMemo, useRef, useState } from "react";
import { Gauge } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

const RANGES = [
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "YTD", label: "YTD" },
] as const;

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Huntr's Fear & Greed index (src/lib/fear-greed.ts): today's reading on a
 * gauge, against yesterday, a week and a month ago; how the mood moved over
 * the week, month or year; and the five signals behind the number, so it is
 * never a black box.
 */
export function FearGreedCard({ className }: { className?: string }) {
  const { data, isLoading, isError } = useFearGreed();
  const [range, setRange] = useState<FearGreedRange>("YTD");
  const points = useMemo(() => data?.points ?? [], [data]);
  const latest = points.at(-1);

  return (
    <Card className={className}>
      <CardContent className="flex h-full flex-col p-4 sm:p-5">
        <SectionHeader
          icon={Gauge}
          title="Fear & Greed"
          subtitle={latest ? `How investors feel · close of ${dayLabel(latest.date)}` : "How investors feel"}
        />

        {isLoading ? (
          <div className="mt-5 space-y-4" aria-hidden>
            <Skeleton className="mx-auto h-28 w-56 rounded-t-full" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
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
            <History points={pointsIn(points, range)} />
            <Signals point={latest} />
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

function arc(from: number, to: number) {
  const a = polar(from);
  const b = polar(to);
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`;
}

/**
 * The gauge. The five zones as one arc, the current zone lit; the needle
 * swings in from fear once, on arrival (the reading is the point of the
 * card, and the swing says "this is a measurement"), never again.
 */
function Dial({ point }: { point: FearGreedPoint }) {
  const zone = zoneOf(point.value);
  return (
    <div className="mt-3 flex flex-col items-center">
      <svg viewBox="0 0 240 132" className="w-full max-w-[17rem]" role="img" aria-label={`Fear & Greed at ${point.value}: ${zone.label}`}>
        {FEAR_GREED_ZONES.map((z) => (
          <path
            key={z.zone}
            d={arc(z.from + 0.8, Math.min(100, z.to) - 0.8)}
            fill="none"
            stroke={ZONE_COLOR[z.zone]}
            strokeWidth={14}
            strokeLinecap="butt"
            opacity={z.zone === zone.zone ? 1 : 0.22}
          />
        ))}
        {[0, 25, 50, 75, 100].map((v) => {
          const p = polar(v, R - 16);
          return (
            <text key={v} x={p.x} y={p.y + 3} textAnchor="middle" className="fill-mist/70 font-mono text-[8px]">
              {v}
            </text>
          );
        })}
        <g className="fg-needle" style={{ "--fg-angle": `${point.value * 1.8 - 90}deg` } as React.CSSProperties}>
          <line x1={CX} y1={CY} x2={CX} y2={CY - R + 6} stroke="var(--color-snow-peak)" strokeWidth={2.5} strokeLinecap="round" />
        </g>
        <circle cx={CX} cy={CY} r={6} fill="var(--color-snow-peak)" />
        <circle cx={CX} cy={CY} r={2.5} fill="var(--color-wolf-surface)" />
      </svg>
      <p className="-mt-1 font-mono text-[34px] font-semibold leading-none tabular-nums" style={{ color: ZONE_COLOR[zone.zone] }}>
        {point.value}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-snow-peak">{zone.label}</p>
    </div>
  );
}

function Comparisons({ points }: { points: FearGreedPoint[] }) {
  const items = [
    { label: "Yesterday", point: points.at(-2) },
    { label: "Last week", point: points.at(-6) },
    { label: "Last month", point: points.at(-22) },
  ];
  return (
    <div className="mt-4 grid grid-cols-3 gap-1.5">
      {items.map(({ label, point }) =>
        point ? (
          <div key={label} className="rounded-lg bg-snow-peak/[0.025] px-2 py-1.5 text-center ring-1 ring-inset ring-wolf-border/40">
            <p className="truncate text-[10.5px] text-mist">{label}</p>
            <p className="mt-0.5 flex items-center justify-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: ZONE_COLOR[zoneOf(point.value).zone] }} aria-hidden />
              <span className="font-mono text-[13px] font-semibold tabular-nums text-snow-peak">{point.value}</span>
            </p>
          </div>
        ) : null
      )}
    </div>
  );
}

// ── History ────────────────────────────────────────────────────────────────

const H_W = 400;
const H_H = 120;

/**
 * The mood over the range: the line coloured by the zone it passes through
 * (red low, green high), over faint zone bands, with the range's high and
 * low named. Hover reads any day.
 */
function History({ points }: { points: FearGreedPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const extremes = extremesOf(points);
  if (points.length < 2 || !extremes) return null;

  const x = (i: number) => (i / (points.length - 1)) * H_W;
  const y = (v: number) => H_H - (v / 100) * H_H;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${H_W} ${H_H} L0 ${H_H} Z`;
  const pct = (i: number) => `${(i / (points.length - 1)) * 100}%`;
  const hi = points.indexOf(extremes.high);
  const lo = points.indexOf(extremes.low);
  const shown = hover != null ? points[hover] : null;

  return (
    <div
      ref={box}
      className="relative mt-2 h-[7.5rem] select-none"
      onPointerMove={(e) => {
        const rect = box.current?.getBoundingClientRect();
        if (!rect) return;
        const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        setHover(Math.round(t * (points.length - 1)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${H_W} ${H_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <defs>
          {/* Top of the box is 100, bottom 0: the stops sit at the zone edges. */}
          <linearGradient id="fg-line" x1="0" y1="0" x2="0" y2={H_H} gradientUnits="userSpaceOnUse">
            {[...FEAR_GREED_ZONES].reverse().map((z) => (
              <stop key={z.zone} offset={`${100 - (z.from + Math.min(100, z.to)) / 2}%`} stopColor={ZONE_COLOR[z.zone]} />
            ))}
          </linearGradient>
        </defs>
        {FEAR_GREED_ZONES.map((z) => (
          <rect key={z.zone} x={0} width={H_W} y={y(Math.min(100, z.to))} height={y(z.from) - y(Math.min(100, z.to))} fill={ZONE_COLOR[z.zone]} opacity={0.05} />
        ))}
        <line x1={0} x2={H_W} y1={y(50)} y2={y(50)} stroke="var(--color-mist)" strokeOpacity={0.3} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#fg-line)" opacity={0.12} />
        <path key={points.length + points[0].date} d={line} fill="none" stroke="url(#fg-line)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="fg-history-line" pathLength={1} />
      </svg>

      {[
        { i: hi, p: extremes.high, above: true },
        { i: lo, p: extremes.low, above: false },
      ].map(({ i, p, above }) => (
        <span
          key={above ? "hi" : "lo"}
          className="pointer-events-none absolute -translate-x-1/2"
          style={{ left: pct(i), top: `${100 - p.value}%` }}
        >
          <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-wolf-surface" style={{ background: ZONE_COLOR[zoneOf(p.value).zone] }} />
          <span
            className={cn(
              "absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tabular-nums text-mist",
              above ? "-top-4" : "top-1.5"
            )}
          >
            {p.value} · {dayLabel(p.date)}
          </span>
        </span>
      ))}

      {shown && hover != null ? (
        <>
          <span className="pointer-events-none absolute inset-y-0 w-px bg-snow-peak/25" style={{ left: pct(hover) }} />
          <span
            className="pointer-events-none absolute top-0 z-10 rounded-md bg-wolf-black/90 px-2 py-1 text-[11px] text-snow-peak ring-1 ring-inset ring-wolf-border/60"
            style={hover > (points.length - 1) / 2 ? { right: `calc(100% - ${pct(hover)} + 6px)` } : { left: `calc(${pct(hover)} + 6px)` }}
          >
            <span className="text-mist">{dayLabel(shown.date)}</span>{" "}
            <span className="font-mono font-semibold tabular-nums" style={{ color: ZONE_COLOR[zoneOf(shown.value).zone] }}>
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

function Signals({ point }: { point: FearGreedPoint }) {
  return (
    <div className="mt-5 border-t border-wolf-border/30 pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-mist">Behind the number</p>
      <ul className="mt-2 space-y-1.5">
        {FEAR_GREED_COMPONENTS.map(({ key, label, question }) => {
          const value = point.components[key];
          return (
            <li key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-2.5" title={question}>
              <span className="truncate text-[12px] text-snow-peak/85">{label}</span>
              <span className="relative h-1.5 rounded-full bg-gradient-to-r from-bearish/35 via-mist/25 to-bullish/35">
                {value != null ? (
                  <span
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-wolf-surface"
                    style={{ left: `${value}%`, background: ZONE_COLOR[zoneOf(value).zone] }}
                  />
                ) : null}
              </span>
              <span className="text-right font-mono text-[12px] tabular-nums text-mist">{value ?? "–"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
