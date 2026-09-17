"use client";

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  CANVAS_THEMES,
  METRICS,
  effectiveValueLabels,
  formatDate,
  formatMonthTick,
  formatTick,
  formatValue,
  seriesInk,
  type CanvasTokens,
  type ChartSpec,
  type MetricUnit,
  type ResolvedChart,
  type ResolvedPoint,
  type ResolvedSeries,
} from "@/lib/chart-builder";

export interface ChartCanvasProps {
  spec: ChartSpec;
  chart: ResolvedChart;
  /** Pixel height of the plot; the parent derives it from the aspect ratio. */
  height: number;
  /** Series under the pointer in the legend; every other series fades. */
  emphasisId?: string | null;
  /** Row (index into `chart.points`) under the pointer, or null; the legend reads that row out. */
  onHoverRow?: (row: number | null) => void;
}

/** What Recharts hands a LabelList / ReferenceDot label renderer. */
interface LabelRenderProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  viewBox?: { x?: number; y?: number; cx?: number; cy?: number; width?: number; height?: number };
}

interface TimeBar {
  key: string;
  seriesId: string;
  axis: "left" | "right";
  ink: string;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  radius: number;
}

const Y_AXIS_WIDTH = 64;

/** The smallest 1 / 2 / 2.5 / 5 × 10ⁿ at or above `v`. */
function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return v;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * A linear axis over [min, max]: it starts at zero unless the data goes
 * below it, ends a step above the data so nothing touches the frame, and
 * its ticks are multiples of one clean step — so a growth chart that dips
 * negative reads −10 / 0 / +10 / +20 rather than −11 / −2 / +7.
 */
function niceAxis(min: number, max: number): { domain: [number, number]; ticks: number[] } {
  const lo0 = min < 0 ? min * 1.08 : 0;
  const hi0 = max > 0 ? max * 1.08 : 0;
  if (!(hi0 > lo0)) return { domain: [0, 1], ticks: [0, 1] };
  const step = niceCeil((hi0 - lo0) / 5);
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.ceil(hi0 / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Number(v.toFixed(10)));
  return { domain: [lo, hi], ticks };
}
/** Share of a bucket a bar (or a group of bars) occupies on the time axis. */
const TIME_BAR_FILL = 0.72;
const QUARTER_MS = 91 * 86_400_000;
/** Entrance: lines draw in, bars rise. Same curve as --ease-entrance; Recharts needs the literal. */
const ENTER_MS = 560;
const ENTER_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
/**
 * Recharts lifts the hovered bar to z 1000, above lines (400): a line
 * crossing that column vanished under it, leaving only its active dot
 * (1200). Lines sit just above the active bar and below the dot.
 */
const LINE_Z = 1050;
/** Value pills ride on ReferenceDots, which default to z 600 — under the active bar. They go above the active dot (1200). */
const PILL_Z = 1300;
/** Each series starts a beat after the previous one, so the chart builds rather than pops. */
const STAGGER_MS = 70;

function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * The value pill: same drawing for bars, lines and areas. Rendered as a
 * ReferenceDot label *element* (Recharts clones it with the viewBox), so
 * the component type is stable across renders — an inline render function
 * would be a new type each time, remounting every pill and replaying its
 * entrance on every pointer move.
 */
function Pill({ viewBox, text, theme, lift, xMin, xMax }: { viewBox?: LabelRenderProps["viewBox"]; text: string; theme: CanvasTokens; lift: number; xMin: number; xMax: number }) {
  const x = viewBox?.cx ?? viewBox?.x ?? 0;
  const y = viewBox?.cy ?? viewBox?.y ?? 0;
  const w = pillWidth(text);
  // Centred over the point, kept inside the plot at the edges, lifted
  // clear of any pill it would otherwise sit on.
  const left = Math.min(Math.max(x - w / 2, xMin), xMax - w);
  const top = y - PILL_H - PILL_GAP - lift;
  return (
    <g className="cb-pill">
      <rect x={left} y={top} width={w} height={PILL_H} rx={5} fill={theme.labelBg} />
      <text x={left + w / 2} y={top + 12.5} textAnchor="middle" fontSize={11} fontWeight={600} fill={theme.labelText} fontFamily="var(--font-mono)">
        {text}
      </text>
    </g>
  );
}

const PILL_H = 18;
/** Space between a point (or bar top) and its pill. */
const PILL_GAP = 5;
/** Recharts' default XAxis height; the plot ends this far above the bottom. */
const X_AXIS_H = 30;
const PLOT_TOP = 24;
const pillWidth = (text: string) => text.length * 6.6 + 12;

/**
 * The plot itself: one ComposedChart that covers bars, lines and areas on
 * two axes, on a category axis (periods) or a time axis (when a price
 * series is present). Title, legend and watermark are HTML around it so
 * they can be interactive; this component only paints what the resolver
 * produced.
 *
 * On the time axis, bars are drawn as ReferenceAreas in data coordinates.
 * Recharts sizes `<Bar>` from the gap between neighbouring rows, and with
 * daily closes in the same table that gap is one day — every bar would be
 * a hairline. A rectangle from bucket-start to bucket-end does not care.
 */
function ChartCanvasImpl({ spec, chart, height, emphasisId = null, onHoverRow }: ChartCanvasProps) {
  /** 1 for the emphasised series (or all, when none is), faint for the rest. */
  const alpha = (id: string) => (emphasisId === null || emphasisId === id ? 1 : 0.18);
  /** The emphasised stroke steps forward a little; the rest keep their width. */
  const strokeFor = (id: string) => (emphasisId === id ? spec.style.lineWidth + 1 : spec.style.lineWidth);
  const theme = CANVAS_THEMES[spec.style.theme];
  const reducedMotion = usePrefersReducedMotion();
  // Recharts' own tweens drive the shapes: a staggered, strongly eased-out
  // entrance. Its default 1.5 s ease is what made every change feel late.
  const tween = (index: number) => ({
    isAnimationActive: !reducedMotion,
    animationDuration: ENTER_MS,
    // Recharts parses cubic-bezier() strings at runtime; its prop type only lists the keywords.
    animationEasing: ENTER_EASE as "ease",
    animationBegin: index * STAGGER_MS,
  });
  const gradientPrefix = useId().replace(/:/g, "");
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  // The row under the pointer goes up to the legend, which reads it out;
  // reported only when it changes, so a pointer crossing a column is one
  // update rather than one per pixel. The canvas itself is memoised, so
  // that update does not come back down as a re-render of the plot.
  const hoveredRow = useRef<number | null>(null);
  const reportRow = (row: number | null) => {
    if (row === hoveredRow.current) return;
    hoveredRow.current = row;
    onHoverRow?.(row);
  };
  const onChartMove = (state: { activeTooltipIndex?: number | string | null | undefined }) => {
    const i = state.activeTooltipIndex === undefined || state.activeTooltipIndex === null ? NaN : Number(state.activeTooltipIndex);
    reportRow(Number.isFinite(i) ? i : null);
  };
  const onChartLeave = () => reportRow(null);
  useEffect(() => () => onHoverRow?.(null), [onHoverRow]);

  const timeMode = chart.xMode === "time";
  // Hidden series are not painted; a price series is never a bar, whatever
  // a hand-made URL says — that would be one rectangle per trading day.
  const visible = useMemo(
    () =>
      chart.series
        .filter((s) => !s.hidden)
        .map((s) => (s.shape === "bar" && METRICS[s.metric].source === "price" ? { ...s, shape: "line" as const } : s)),
    [chart.series]
  );
  const hasRight = visible.some((s) => s.axis === "right");
  const leftUnit = chart.axes.left;
  const rightUnit = chart.axes.right;
  // Log needs strictly positive data and no bars (a bar has no base on a
  // log axis); anything else silently stays linear.
  const logOk =
    spec.style.yScale === "log" &&
    visible.length > 0 &&
    visible.every((s) => s.shape !== "bar" && s.unit !== "percent") &&
    chart.points.every((p) => visible.every((s) => p[s.id] === null || (p[s.id] as number) > 0));
  const yScale = logOk ? "log" : "auto";
  const leftWidth = spec.style.yLeftFormat === "full" ? 104 : Y_AXIS_WIDTH;
  const rightWidth = spec.style.yRightFormat === "full" ? 104 : Y_AXIS_WIDTH;

  /** What an axis measures, for its rotated caption: "Revenue", "Price · FCF / share". */
  const axisCaption = (axis: "left" | "right") => {
    const names = new Set<string>();
    for (const s of visible) {
      if (s.axis !== axis) continue;
      const base = METRICS[s.metric].label;
      names.add(
        s.transform === "per_share" ? `${base} / share` : s.transform === "ttm" ? `${base} TTM` : s.transform === "yoy" ? `${base} YoY %` : s.transform === "indexed" ? `${base}, indexed %` : base
      );
    }
    return [...names].join(" · ");
  };

  const unitByLabel = useMemo(() => {
    const m = new Map<string, MetricUnit>();
    for (const s of chart.series) m.set(s.label, s.unit);
    return m;
  }, [chart.series]);

  const timeDomain = useMemo<[number, number]>(
    () => [chart.points[0]?.x ?? 0, chart.points[chart.points.length - 1]?.x ?? 1],
    [chart.points]
  );

  // Bars that stack: per axis, the ordered bar series when there are ≥ 2.
  const stackedBars = useMemo(() => {
    const byAxis: Record<"left" | "right", ResolvedSeries[]> = { left: [], right: [] };
    if (!spec.style.stacked) return byAxis;
    for (const s of visible) if (s.shape === "bar") byAxis[s.axis].push(s);
    if (byAxis.left.length < 2) byAxis.left = [];
    if (byAxis.right.length < 2) byAxis.right = [];
    return byAxis;
  }, [spec.style.stacked, visible]);
  const stackIdFor = (s: ResolvedSeries) => (stackedBars[s.axis].includes(s) ? s.axis : undefined);

  // The linear axes are laid out here, not by Recharts: the extent per
  // axis (stacks summed) becomes a clean-stepped domain with its ticks.
  const linearAxes = useMemo(() => {
    const extent = (axis: "left" | "right") => {
      let min = Infinity;
      let max = -Infinity;
      const own = visible.filter((s) => s.axis === axis);
      const stack = stackedBars[axis];
      const loose = own.filter((s) => !stack.includes(s));
      for (const row of chart.points) {
        for (const s of loose) {
          const v = row[s.id];
          if (v === null || v === undefined) continue;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (stack.length) {
          let pos = 0;
          let neg = 0;
          for (const s of stack) {
            const v = row[s.id];
            if (v === null || v === undefined) continue;
            if (v >= 0) pos += v;
            else neg += v;
          }
          if (neg < min) min = neg;
          if (pos > max) max = pos;
        }
      }
      return Number.isFinite(min) ? niceAxis(min, max) : niceAxis(0, 0);
    };
    return { left: extent("left"), right: extent("right") };
  }, [visible, stackedBars, chart.points]);
  const yAxisProps = (axis: "left" | "right") =>
    logOk ? { domain: ["auto", "auto"] as const, tickCount: 6 } : { domain: linearAxes[axis].domain, ticks: linearAxes[axis].ticks };
  const topOfStack = (s: ResolvedSeries) => {
    const stack = stackedBars[s.axis];
    return stack.length === 0 || stack[stack.length - 1] === s;
  };

  // Rows that get a value pill, per series (row = index into chart.points).
  const allBars = visible.length > 0 && visible.every((s) => s.shape === "bar");
  const labelMode = effectiveValueLabels(spec.style.valueLabels, allBars, chart.points.length);
  const labelRows = useMemo(() => {
    const out = new Map<string, Set<number>>();
    const mode = labelMode;
    if (mode === "none") return out;
    const rowOf = (x: number) => (timeMode ? chart.points.findIndex((p) => p.x === x) : x);
    for (const s of visible) {
      const rows = new Set<number>();
      if (mode === "all") chart.points.forEach((p, i) => p[s.id] !== null && rows.add(i));
      else {
        if (s.last) rows.add(rowOf(s.last.x));
        if (mode === "ends" && s.first) rows.add(rowOf(s.first.x));
      }
      out.set(s.id, rows);
    }
    return out;
  }, [labelMode, chart.points, visible, timeMode]);

  /** Stack total at a row, for the pill on the topmost bar of a stack. */
  const stackTotal = (s: ResolvedSeries, row: ResolvedPoint) => {
    const stack = stackedBars[s.axis];
    if (stack.length === 0) return row[s.id];
    return stack.reduce((acc, b) => acc + (row[b.id] ?? 0), 0);
  };

  // Time-axis bars as data-coordinate rectangles.
  const timeBars = useMemo<TimeBar[]>(() => {
    if (!timeMode) return [];
    const barSeries = visible.filter((s) => s.shape === "bar");
    if (barSeries.length === 0) return [];
    const rows = chart.points.filter((p) => barSeries.some((s) => p[s.id] !== null));
    let span = Infinity;
    for (let i = 1; i < rows.length; i++) span = Math.min(span, rows[i].x - rows[i - 1].x);
    if (!Number.isFinite(span)) span = spec.granularity === "annual" ? QUARTER_MS * 4 : QUARTER_MS;
    const slot = span * TIME_BAR_FILL;
    const grouped = barSeries.filter((s) => !stackIdFor(s));

    const out: TimeBar[] = [];
    rows.forEach((row) => {
      const acc: Record<"left" | "right", number> = { left: 0, right: 0 };
      barSeries.forEach((s) => {
        const v = row[s.id];
        if (v === null || v === undefined) return;
        const stacked = !!stackIdFor(s);
        let x1: number;
        let x2: number;
        if (stacked) {
          x1 = row.x - slot / 2;
          x2 = row.x + slot / 2;
        } else {
          const w = slot / grouped.length;
          x1 = row.x - slot / 2 + grouped.indexOf(s) * w + w * 0.04;
          x2 = x1 + w * 0.92;
        }
        const y1 = stacked ? acc[s.axis] : 0;
        const y2 = stacked ? acc[s.axis] + v : v;
        if (stacked) acc[s.axis] += v;
        out.push({
          key: `${s.id}-${row.x}-${y2}`,
          seriesId: s.id,
          axis: s.axis,
          ink: seriesInk(s.color, spec.style.theme),
          x1,
          x2,
          y1,
          y2,
          radius: topOfStack(s) ? spec.style.barRadius : 0,
        });
      });
    });
    return out;
    // stackIdFor / topOfStack / stackTotal derive from stackedBars, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeMode, visible, chart.points, spec.granularity, spec.style.theme, spec.style.barRadius, stackedBars]);

  // Value pills in data coordinates, so bars, lines and areas on either
  // axis share one mechanism regardless of how Recharts lays the item out.
  // Every pill sits centred above its point. Two pills in one column (a
  // line crossing a bar, say) would land on each other, so their pixel
  // positions are worked out here from the axes the plot is given, and a
  // pill that would overlap one already placed is lifted above it.
  const plotLeft = leftWidth;
  const plotRight = width - (hasRight ? rightWidth : 12);
  const pills = useMemo(() => {
    type P = { key: string; axis: "left" | "right"; x: number; y: number; text: string; row: number; lift: number };
    const out: P[] = [];
    for (const s of visible) {
      const rows = labelRows.get(s.id);
      if (!rows) continue;
      const isBar = s.shape === "bar";
      if (isBar && !topOfStack(s)) continue;
      for (const i of rows) {
        const row = chart.points[i];
        if (!row) continue;
        const raw = isBar ? stackTotal(s, row) : row[s.id];
        if (raw === null || raw === undefined) continue;
        out.push({ key: `${s.id}-${i}-${raw}`, axis: s.axis, x: row.x, y: raw, text: formatValue(s.unit, raw), row: i, lift: 0 });
      }
    }
    if (logOk || out.length < 2 || width <= 0) return out;

    const plotW = plotRight - plotLeft;
    const plotH = height - PLOT_TOP - X_AXIS_H;
    const n = chart.points.length;
    const [t0, t1] = timeDomain;
    const px = (p: P) => (timeMode ? plotLeft + ((p.x - t0) / Math.max(1, t1 - t0)) * plotW : plotLeft + (plotW / n) * (p.row + 0.5));
    const py = (p: P) => {
      const [lo, hi] = linearAxes[p.axis].domain;
      return PLOT_TOP + ((hi - p.y) / (hi - lo || 1)) * plotH;
    };
    // Lowest pills first, so a higher one lifts over what is already placed.
    const placed: Array<{ x: number; top: number; w: number }> = [];
    for (const p of out.slice().sort((a, b) => py(b) - py(a))) {
      const w = pillWidth(p.text);
      const x = Math.min(Math.max(px(p) - w / 2, plotLeft), plotRight - w);
      let top = py(p) - PILL_H - PILL_GAP;
      for (const q of placed) {
        const overlapsX = x < q.x + q.w + 3 && x + w > q.x - 3;
        const overlapsY = top < q.top + PILL_H + 2 && top + PILL_H > q.top - 2;
        if (overlapsX && overlapsY) top = q.top - PILL_H - 3;
      }
      p.lift = py(p) - PILL_H - PILL_GAP - top;
      placed.push({ x, top, w });
    }
    return out;
    // stackTotal / topOfStack derive from stackedBars, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, labelRows, chart.points, stackedBars, logOk, width, height, plotLeft, plotRight, timeMode, timeDomain, linearAxes]);

  const xTickFormatter = timeMode ? (v: number) => formatMonthTick(v) : (v: number) => chart.xLabels[v] ?? "";
  const tooltipLabel = timeMode
    ? (label: string) => formatDate(Number(label))
    : (label: string) => chart.xLabels[Number(label)] ?? label;

  const tick = { fill: theme.tick, fontSize: 11, fontFamily: "var(--font-mono)" } as const;
  const axisLabel = (axis: "left" | "right") => ({
    value: axisCaption(axis),
    angle: axis === "left" ? -90 : 90,
    position: (axis === "left" ? "insideLeft" : "insideRight") as "insideLeft" | "insideRight",
    offset: 12,
    style: { textAnchor: "middle" as const, fill: theme.tick, fontSize: 11, fontFamily: "var(--font-heading)" },
  });

  // Grid lines sit between categories, not through them: one at each band
  // boundary. On the time axis the axis ticks are used, minus the edges,
  // which the plot frame already draws.
  const verticalLines = ({ xAxis, offset }: { xAxis?: { scale?: unknown } | undefined; offset: { left: number; width: number } }): number[] => {
    const left = offset.left;
    const width = offset.width;
    if (!timeMode) {
      const n = Math.max(1, chart.points.length);
      return Array.from({ length: n + 1 }, (_, i) => left + (width / n) * i);
    }
    // Recharts wraps the d3 scale: `.ticks()` proposes tick values, `.map()`
    // places them.
    const scale = xAxis?.scale as { map?: (v: unknown) => number | undefined; ticks?: (n: number) => unknown[] } | undefined;
    if (!scale || typeof scale.map !== "function" || typeof scale.ticks !== "function") return [];
    const map = scale.map;
    return scale
      .ticks(8)
      .map((t) => map.call(scale, t))
      .filter((x): x is number => typeof x === "number" && x > left + 1 && x < left + width - 1);
  };

  return (
    <div ref={wrapRef} className="chart-builder-plot" style={{ width: "100%", height }}>
      {width > 0 && (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={chart.points} margin={{ top: 24, right: hasRight ? 0 : 12, left: 0, bottom: 0 }} barCategoryGap="10%" barGap={1} onMouseMove={onChartMove} onMouseLeave={onChartLeave}>
            <defs>
              {visible
                .filter((s) => s.shape === "area")
                .map((s) => {
                  const ink = seriesInk(s.color, spec.style.theme);
                  return (
                    <linearGradient key={s.id} id={`${gradientPrefix}-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ink} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={ink} stopOpacity={0} />
                    </linearGradient>
                  );
                })}
            </defs>

            {spec.style.grid && <CartesianGrid stroke={theme.grid} strokeOpacity={1} vertical horizontal verticalCoordinatesGenerator={verticalLines} />}

            {timeMode ? (
              <XAxis dataKey="x" type="number" scale="time" domain={timeDomain} axisLine={false} tickLine={false} tick={tick} dy={8} minTickGap={40} tickFormatter={xTickFormatter} />
            ) : (
              <XAxis dataKey="x" type="category" axisLine={false} tickLine={false} tick={tick} dy={8} interval="preserveStartEnd" minTickGap={28} tickFormatter={xTickFormatter} />
            )}

            <YAxis yAxisId="left" orientation="left" scale={yScale} {...yAxisProps("left")} allowDataOverflow={logOk} axisLine={false} tickLine={false} tick={tick} width={leftWidth} tickFormatter={(v: number) => formatTick(leftUnit, v, spec.style.yLeftFormat)} label={axisLabel("left")} />
            {hasRight && (
              <YAxis yAxisId="right" orientation="right" scale={yScale} {...yAxisProps("right")} allowDataOverflow={logOk} axisLine={false} tickLine={false} tick={tick} width={rightWidth} tickFormatter={(v: number) => formatTick(rightUnit, v, spec.style.yRightFormat)} label={axisLabel("right")} />
            )}

            {/* No cursor line: the hovered bar brightens and the point on a
                line grows, which is all the pointer needs. */}
            <Tooltip
              cursor={false}
              content={<ChartTooltip formatter={(value: number, name: string) => formatValue(unitByLabel.get(name) ?? "currency", value)} labelFormatter={tooltipLabel} />}
            />

            {timeBars.map((b) => (
              <ReferenceArea
                key={b.key}
                yAxisId={b.axis}
                x1={b.x1}
                x2={b.x2}
                y1={b.y1}
                y2={b.y2}
                fill={b.ink}
                fillOpacity={alpha(b.seriesId)}
                stroke="none"
                radius={b.radius}
                ifOverflow="visible"
              />
            ))}
            {pills.map((p) => (
              <ReferenceDot
                key={p.key}
                yAxisId={p.axis}
                x={p.x}
                y={p.y}
                r={0}
                stroke="none"
                fill="none"
                ifOverflow="visible"
                zIndex={PILL_Z}
                label={<Pill text={p.text} theme={theme} lift={p.lift} xMin={plotLeft} xMax={plotRight} />}
              />
            ))}

            {visible.map((s, index) => {
              const ink = seriesInk(s.color, spec.style.theme);
              const common = { dataKey: s.id, name: s.label, yAxisId: s.axis, ...tween(index) };
              // Presentation attributes reach the drawn path; a `style` prop would not.
              const fade = { strokeOpacity: alpha(s.id), fillOpacity: alpha(s.id) };

              if (s.shape === "bar") {
                // On the time axis the bar is a ReferenceArea; keep an invisible
                // Bar so the series still reaches the tooltip.
                if (timeMode) return <Bar key={s.id} {...common} fill="none" isAnimationActive={false} />;
                const r = spec.style.barRadius;
                return (
                  <Bar key={s.id} {...common} {...fade} fill={ink} stackId={stackIdFor(s)} radius={topOfStack(s) ? [r, r, 0, 0] : 0} minPointSize={1} activeBar={{ fill: ink, stroke: theme.title, strokeWidth: 1, strokeOpacity: 0.45 }} />
                );
              }
              if (s.shape === "area") {
                return (
                  <Area
                    key={s.id}
                    {...common}
                    {...fade}
                    type="monotone"
                    stroke={ink}
                    strokeWidth={strokeFor(s.id)}
                    fill={`url(#${gradientPrefix}-${s.id})`}
                    dot={false}
                    connectNulls={timeMode}
                    activeDot={{ r: 4, fill: ink, stroke: theme.plot, strokeWidth: 2 }}
                  />
                );
              }
              return (
                <Line
                  key={s.id}
                  {...common}
                  {...fade}
                  type="monotone"
                  stroke={ink}
                  strokeWidth={strokeFor(s.id)}
                  dot={false}
                  connectNulls={timeMode}
                  activeDot={{ r: 4, fill: ink, stroke: theme.plot, strokeWidth: 2 }}
                  zIndex={LINE_Z}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export const ChartCanvas = memo(ChartCanvasImpl);

export default ChartCanvas;
