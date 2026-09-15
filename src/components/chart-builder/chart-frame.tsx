"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
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
}

const RATIO: Record<AspectRatio, number> = { "16:9": 9 / 16, "4:3": 3 / 4, "1:1": 1 };

/**
 * The exportable object: title, legend, plot and watermark on the canvas
 * theme's background, independent of the app's light/dark chrome.
 */
export function ChartFrame({ spec, data, selectedId, onSelect, onChange }: ChartFrameProps) {
  const theme = CANVAS_THEMES[spec.style.theme];
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(0);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setPlotWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = Math.round(Math.min(640, Math.max(220, plotWidth * RATIO[spec.style.aspect])));
  const showSkeleton = data.isLoading && data.chart.points.length === 0;

  const toggle = (id: string) =>
    onChange({ ...spec, series: spec.series.map((s) => (s.id === id ? { ...s, hidden: !s.hidden } : s)) });
  const isolate = (id: string) => {
    const alreadyAlone = spec.series.every((s) => (s.id === id ? !s.hidden : s.hidden));
    onChange({ ...spec, series: spec.series.map((s) => ({ ...s, hidden: alreadyAlone ? false : s.id !== id })) });
  };

  return (
    <div
      className="flex flex-col rounded-2xl px-4 pb-4 pt-5 ring-1 ring-inset transition-colors duration-200 sm:px-6"
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
        onToggle={toggle}
        onIsolate={isolate}
        onSelect={onSelect}
      />

      <div
        ref={plotRef}
        className="mx-auto mt-2 w-full"
        style={{ maxWidth: spec.style.aspect === "1:1" ? 640 : spec.style.aspect === "4:3" ? 860 : undefined, height }}
      >
        {plotWidth > 0 && (showSkeleton ? <Skeleton className="h-full w-full rounded-xl" /> : <ChartCanvas spec={spec} chart={data.chart} height={height} />)}
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <ul className="flex min-w-0 flex-col gap-0.5 text-[11px]" style={{ color: theme.tick }} aria-live="polite">
          {data.chart.warnings.slice(0, 3).map((w, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{w.message}</span>
            </li>
          ))}
        </ul>
        {spec.style.watermark && (
          <p className="flex shrink-0 items-center gap-1.5 text-[11px]" style={{ color: theme.tick }}>
            <span>Powered by</span>
            <span className="text-[10px] font-semibold tracking-[0.12em]" style={{ color: theme.title, opacity: 0.8 }}>
              HUNTR
            </span>
            <span>· huntrvalue.me</span>
          </p>
        )}
      </div>
    </div>
  );
}
