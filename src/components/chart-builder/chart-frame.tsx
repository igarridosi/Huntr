"use client";

import dynamic from "next/dynamic";
import { forwardRef, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CANVAS_THEMES, type AspectRatio, type ChartSpec } from "@/lib/chart-builder";
import type { ChartData } from "@/hooks/use-chart-data";
import { ChartLegend } from "./chart-legend";
import { ChartTitle } from "./chart-title";

const ChartCanvas = dynamic(() => import("./chart-canvas").then((m) => m.ChartCanvas), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-xl" />,
});

interface ChartFrameProps {
  spec: ChartSpec;
  data: ChartData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: ChartSpec, coalesce?: string) => void;
  /**
   * Fill the height the parent gives (a desktop workspace that must fit the
   * viewport) instead of growing with the width. The plot then takes the
   * larger size that still respects the aspect ratio.
   */
  fill?: boolean;
  className?: string;
}

const RATIO: Record<AspectRatio, number> = { "16:9": 9 / 16, "4:3": 3 / 4, "1:1": 1 };

/**
 * The exportable object: title, legend, plot and watermark on the canvas
 * theme's background, independent of the app's light/dark chrome.
 */
export const ChartFrame = forwardRef<HTMLDivElement, ChartFrameProps>(function ChartFrame(
  { spec, data, selectedId, onSelect, onChange, fill = false, className },
  ref
) {
  const theme = CANVAS_THEMES[spec.style.theme];
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotBox, setPlotBox] = useState({ w: 0, h: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      const w = r?.width ?? 0;
      const h = r?.height ?? 0;
      setPlotBox((prev) => (Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ratio = RATIO[spec.style.aspect];
  const plotWidth = plotBox.w;
  // Width-driven when the frame grows with the page; box-driven when it
  // has to fit the viewport, where the plot takes whichever of width and
  // height is the tighter constraint at this aspect.
  const byWidth = Math.round(Math.min(640, Math.max(220, plotWidth * ratio)));
  const height = fill && plotBox.h > 120 ? Math.round(Math.min(plotWidth * ratio, plotBox.h)) : byWidth;
  const width = Math.round(Math.min(plotWidth, height / ratio));
  const showSkeleton = data.isLoading && data.chart.points.length === 0;
  // A new window or granularity remounts the plot: it fades in and its
  // series re-enter, so the change reads as a fresh chart rather than
  // bars shuffling into new slots.
  const plotKey = `${data.range.from ?? ""}|${data.range.to ?? ""}|${spec.granularity}`;

  const toggle = (id: string) =>
    onChange({ ...spec, series: spec.series.map((s) => (s.id === id ? { ...s, hidden: !s.hidden } : s)) });
  const isolate = (id: string) => {
    const alreadyAlone = spec.series.every((s) => (s.id === id ? !s.hidden : s.hidden));
    onChange({ ...spec, series: spec.series.map((s) => ({ ...s, hidden: alreadyAlone ? false : s.id !== id })) });
  };

  return (
    <div
      ref={ref}
      className={cn("flex flex-col rounded-2xl px-4 pb-4 pt-5 ring-1 ring-inset transition-colors duration-200 sm:px-6", fill && "min-h-0", className)}
      style={{ background: theme.bg, ["--tw-ring-color" as string]: theme.ring }}
    >
      <ChartTitle
        title={spec.title}
        subtitle={spec.subtitle}
        theme={spec.style.theme}
        onTitleChange={(title) => onChange({ ...spec, title })}
        onSubtitleChange={(subtitle) => onChange({ ...spec, subtitle: subtitle || undefined })}
      />

      <ChartLegend
        spec={spec}
        pendingTickers={data.pendingTickers}
        selectedId={selectedId}
        hoverId={hoverId}
        onToggle={toggle}
        onIsolate={isolate}
        onSelect={onSelect}
        onHover={setHoverId}
      />

      <div ref={plotRef} className={cn("mt-2 flex w-full justify-center", fill ? "min-h-0 flex-1 items-center" : "items-start")} style={fill ? undefined : { height }}>
        {plotWidth > 0 && (
          <div key={plotKey} className="cb-plot-in" style={{ width, height }}>
            {showSkeleton ? <Skeleton className="h-full w-full rounded-xl" /> : <ChartCanvas spec={spec} chart={data.chart} height={height} emphasisId={hoverId} />}
          </div>
        )}
      </div>

      <div className="mt-3 flex shrink-0 items-end justify-between gap-4">
        <ul className="flex min-w-0 flex-col gap-0.5 text-[11px]" style={{ color: theme.tick }} aria-live="polite">
          {data.chart.warnings.slice(0, 3).map((w, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{w.message}</span>
            </li>
          ))}
        </ul>
        {/* The watermark is part of the artifact, not an option: a chart that
            travels should say where it came from. */}
        <p className="flex shrink-0 items-center gap-2 text-xs" style={{ color: theme.tick }}>
          <span>Powered by</span>
          <span className="inline-flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static asset, plain <img> keeps the export path simple */}
            <img src="/logo/HunterLogoCut-removebg.png" alt="" aria-hidden className="h-5 w-5 object-contain" />
            <span className="text-[15px] font-semibold tracking-[0.14em]" style={{ color: theme.title }}>
              HUNTR
            </span>
          </span>
        </p>
      </div>
    </div>
  );
});
