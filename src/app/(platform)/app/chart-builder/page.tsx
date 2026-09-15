"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChartColumnStacked, LayoutTemplate, Link2, Redo2, Undo2 } from "lucide-react";
import { fetchDefaultWatchlistTickers } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { FeedbackToast } from "@/components/ui/feedback-toast";
import { ChartControls } from "@/components/chart-builder/chart-controls";
import { ChartFrame } from "@/components/chart-builder/chart-frame";
import { SeriesPanel } from "@/components/chart-builder/series-panel";
import { TemplateGallery } from "@/components/chart-builder/template-gallery";
import { useChartData } from "@/hooks/use-chart-data";
import { useChartHistory } from "@/hooks/use-chart-history";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { STALE_TIMES } from "@/lib/constants";
import { SPEC_QUERY_PARAM, createSpec, decodeSpec, encodeSpec, type ChartSpec, type ChartTemplate } from "@/lib/chart-builder";
import ChartBuilderLoading from "./loading";

export default function ChartBuilderPage() {
  return (
    <Suspense fallback={<ChartBuilderLoading />}>
      <ChartBuilder />
    </Suspense>
  );
}

const URL_DEBOUNCE_MS = 400;

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

function ChartBuilder() {
  const params = useSearchParams();
  // The URL is read once: after mount the spec is the source of truth and
  // the URL merely mirrors it.
  const [initial] = useState(() => decodeSpec(params.get(SPEC_QUERY_PARAM)) ?? createSpec({ title: "" }));
  const history = useChartHistory(initial);
  const { spec, update, reset, undo, redo, canUndo, canRedo } = history;
  const data = useChartData(spec);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [toast, setToast] = useState<{ title: string; message?: string } | null>(null);

  const watchlist = useQuery({
    queryKey: ["watchlist", "default-tickers"],
    queryFn: fetchDefaultWatchlistTickers,
    staleTime: STALE_TIMES.WATCHLIST,
  });

  // Mirror the spec into ?c= without touching the router, debounced so a
  // scrubbed colour does not write forty history-free URL updates.
  const urlTimer = useRef<number | null>(null);
  useEffect(() => {
    if (urlTimer.current) window.clearTimeout(urlTimer.current);
    urlTimer.current = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (spec.series.length === 0 && !spec.title) url.searchParams.delete(SPEC_QUERY_PARAM);
      else url.searchParams.set(SPEC_QUERY_PARAM, encodeSpec(spec));
      window.history.replaceState(window.history.state, "", url.toString());
    }, URL_DEBOUNCE_MS);
    return () => {
      if (urlTimer.current) window.clearTimeout(urlTimer.current);
    };
  }, [spec]);

  useKeyboardShortcut({ key: "z", metaKey: true }, (e) => { if (!isTypingTarget(e)) undo(); });
  useKeyboardShortcut({ key: "z", metaKey: true, shiftKey: true }, (e) => { if (!isTypingTarget(e)) redo(); });

  const onChange = useCallback((next: ChartSpec, coalesce?: string) => update(next, coalesce), [update]);

  const pickTemplate = useCallback(
    (t: ChartTemplate) => {
      reset(t.build(watchlist.data ?? []));
      setSelectedId(null);
      setShowTemplates(false);
    },
    [reset, watchlist.data]
  );

  const share = useCallback(async () => {
    const url = new URL(window.location.href);
    url.searchParams.set(SPEC_QUERY_PARAM, encodeSpec(spec));
    try {
      await navigator.clipboard.writeText(url.toString());
      setToast({ title: "Link copied", message: "Anyone with the link opens this exact chart." });
    } catch {
      setToast({ title: "Could not copy", message: "Copy the address from the browser bar instead." });
    }
  }, [spec]);

  const empty = spec.series.length === 0;

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sunset-orange/10 ring-1 ring-inset ring-sunset-orange/20">
            <ChartColumnStacked className="h-5 w-5 text-sunset-orange" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-snow-peak">Chart Builder</h1>
            <p className="mt-1 text-[10px] uppercase tracking-[0.09em] text-mist/85">Compose, compare, share</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!empty && (
            <Button variant="ghost" size="sm" aria-pressed={showTemplates} onClick={() => setShowTemplates((v) => !v)}>
              <LayoutTemplate className="mr-1.5 h-3.5 w-3.5" />
              Templates
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Undo" disabled={!canUndo} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Redo" disabled={!canRedo} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" disabled={empty} onClick={share}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Share
          </Button>
        </div>
      </header>

      {empty ? (
        <TemplateGallery onPick={pickTemplate} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="order-2 lg:order-1">
            <SeriesPanel spec={spec} selectedId={selectedId} onSelect={setSelectedId} onChange={onChange} />
          </div>
          <div className="order-1 flex min-w-0 flex-col gap-3 lg:order-2">
            <ChartFrame spec={spec} data={data} selectedId={selectedId} onSelect={setSelectedId} onChange={onChange} />
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <ChartControls spec={spec} onChange={onChange} />
            </div>
            {showTemplates && (
              <div className="rounded-2xl bg-wolf-surface/60 p-3 ring-1 ring-inset ring-wolf-border/50">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-mist/85">Templates · replaces the current chart</p>
                <TemplateGallery compact onPick={pickTemplate} />
              </div>
            )}
          </div>
        </div>
      )}

      <FeedbackToast
        open={toast !== null}
        title={toast?.title ?? ""}
        message={toast?.message}
        variant="success"
        onClose={() => setToast(null)}
      />
    </div>
  );
}
