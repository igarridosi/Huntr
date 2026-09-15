"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChartColumnStacked, Download, LayoutTemplate, Link2, Redo2, Undo2 } from "lucide-react";
import { fetchDefaultWatchlistTickers } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { FeedbackToast, type FeedbackToastVariant } from "@/components/ui/feedback-toast";
import { ChartControls } from "@/components/chart-builder/chart-controls";
import { ChartFrame } from "@/components/chart-builder/chart-frame";
import { DesignPanel } from "@/components/chart-builder/design-panel";
import { ExportDialog } from "@/components/chart-builder/export-dialog";
import { SeriesPanel } from "@/components/chart-builder/series-panel";
import { TemplateGallery } from "@/components/chart-builder/template-gallery";
import { useChartData } from "@/hooks/use-chart-data";
import { useChartHistory } from "@/hooks/use-chart-history";
import { useDeepFinancials, type DeepLoadOutcome } from "@/hooks/use-deep-financials";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useMediaQuery } from "@/hooks/use-media-query";
import { STALE_TIMES } from "@/lib/constants";
import { SPEC_QUERY_PARAM, createSpec, decodeSpec, encodeSpec, type ChartSpec, type ChartTemplate } from "@/lib/chart-builder";
import ChartBuilderLoading from "./loading";

// framer-motion only rides along on phones.
const MobileSheet = dynamic(() => import("@/components/chart-builder/mobile-sheet").then((m) => m.MobileSheet), { ssr: false });

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

type Toast = { title: string; message?: string; variant: FeedbackToastVariant };

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
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const getFrame = useCallback(() => frameRef.current, []);

  const notify = useCallback((title: string, message?: string, variant: FeedbackToastVariant = "success") => {
    setToast({ title, message, variant });
  }, []);

  const onDeepDone = useCallback(
    (o: DeepLoadOutcome) => {
      if (o.limitHit && o.loaded.length > 0) notify("Alpha Vantage limit reached", `${o.loaded.join(", ")} loaded; the rest stay on Yahoo Finance for now.`, "warning");
      else if (o.limitHit) notify("Alpha Vantage is rate-limited", "Showing Yahoo Finance data; try again in a minute.", "warning");
      else if (o.loaded.length > 0) notify("20-year history loaded", `${o.loaded.join(", ")} now come from Alpha Vantage.`);
      else if (o.failed.length > 0) notify("History unavailable", `No Alpha Vantage statements for ${o.failed.join(", ")}.`, "warning");
    },
    [notify]
  );
  const deep = useDeepFinancials(onDeepDone);

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
      notify("Link copied", "Anyone with the link opens this exact chart.");
    } catch {
      notify("Could not copy", "Copy the address from the browser bar instead.", "warning");
    }
  }, [spec, notify]);

  const empty = spec.series.length === 0;
  const hasPlot = !empty && data.chart.points.length > 0;

  const seriesPanel = <SeriesPanel spec={spec} selectedId={selectedId} onSelect={setSelectedId} onChange={onChange} />;
  const designPanel = (
    <DesignPanel
      spec={spec}
      onChange={onChange}
      dataSource={{
        deepTickers: data.deepTickers,
        statements: data.statements,
        loading: deep.loading,
        blocked: deep.blocked,
        onLoadDeep: () =>
          deep.load(
            data.tickers.filter((t) => !data.deepTickers.includes(t)),
            data.statements
          ),
      }}
    />
  );

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sunset-orange/10 ring-1 ring-inset ring-sunset-orange/20">
            <ChartColumnStacked className="h-5 w-5 text-sunset-orange" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-snow-peak">Chart Builder</h1>
            <p className="mt-1 text-[10px] uppercase tracking-[0.09em] text-mist/85">Compose, compare, export</p>
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
          <Button size="sm" disabled={!hasPlot} onClick={() => setExportOpen(true)}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </header>

      {empty ? (
        <TemplateGallery onPick={pickTemplate} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)_264px]">
          {isDesktop && <div>{seriesPanel}</div>}
          <div className="flex min-w-0 flex-col gap-3">
            <ChartFrame ref={frameRef} spec={spec} data={data} selectedId={selectedId} onSelect={setSelectedId} onChange={onChange} />
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
          {isDesktop && <div>{designPanel}</div>}
          {/* Room for the collapsed sheet so the range controls are never under it. */}
          {!isDesktop && <div aria-hidden className="h-24" />}
        </div>
      )}

      {!empty && !isDesktop && <MobileSheet series={seriesPanel} design={designPanel} />}

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} spec={spec} getFrame={getFrame} onNotify={notify} />

      <FeedbackToast
        open={toast !== null}
        title={toast?.title ?? ""}
        message={toast?.message}
        variant={toast?.variant ?? "success"}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
