"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChartColumnStacked, Download, Link2, Loader2, Redo2, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackToast, type FeedbackToastVariant } from "@/components/ui/feedback-toast";
import { ChartControls } from "@/components/chart-builder/chart-controls";
import { ChartFrame } from "@/components/chart-builder/chart-frame";
import { DesignPanel } from "@/components/chart-builder/design-panel";
import { ExportDialog } from "@/components/chart-builder/export-dialog";
import { SavedChartsMenu } from "@/components/chart-builder/saved-charts-menu";
import { SeriesPanel } from "@/components/chart-builder/series-panel";
import { StartPrompt } from "@/components/chart-builder/start-prompt";
import { TemplateGallery } from "@/components/chart-builder/template-gallery";
import { useChartData } from "@/hooks/use-chart-data";
import { useChartHistory } from "@/hooks/use-chart-history";
import { useDeepFinancials, type DeepLoadOutcome } from "@/hooks/use-deep-financials";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSavedCharts, type SavedChart } from "@/hooks/use-saved-charts";
import { useAuthGate } from "@/providers/auth-gate-provider";
import { SPEC_QUERY_PARAM, createSeries, createSpec, decodeSpec, encodeSpec, paletteColor, type ChartSpec, type ChartTemplate } from "@/lib/chart-builder";
import { cn } from "@/lib/utils";
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
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const saved = useSavedCharts();
  const { openGate } = useAuthGate();
  // The row this chart lives in, and the spec as it was last saved there,
  // so "Unsaved changes" is a comparison rather than a flag to maintain.
  const [savedRef, setSavedRef] = useState<{ id: string; encoded: string } | null>(null);
  const [saving, setSaving] = useState(false);

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

  // Templates reshape the companies already on the chart; they never add one.
  const pickTemplate = useCallback(
    (t: ChartTemplate) => {
      const next = t.build(data.tickers);
      if (next.series.length === 0) return;
      reset(next);
      setSavedRef(null);
      setSelectedId(null);
    },
    [reset, data.tickers]
  );

  const startWith = useCallback(
    (ticker: string) => {
      const t = ticker.toUpperCase();
      setSavedRef(null);
      reset(
        createSpec({
          title: `${t} — Revenue`,
          subtitle: "Quarterly revenue",
          series: [createSeries({ ticker: t, metric: "revenue", shape: "bar", color: paletteColor(0) })],
        })
      );
    },
    [reset]
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
  const encoded = encodeSpec(spec);
  const savedRow = savedRef ? saved.charts.find((c) => c.id === savedRef.id) ?? null : null;
  const dirty = savedRef !== null && savedRef.encoded !== encoded;

  const saveChart = useCallback(async () => {
    if (empty || saving) return;
    setSaving(true);
    try {
      const name = savedRow?.name ?? spec.title.trim() ?? "";
      const id = await saved.save({ id: savedRef?.id, name: name || "Untitled chart", spec });
      if (id) {
        setSavedRef({ id, encoded });
        notify(savedRef ? "Chart updated" : "Chart saved", savedRef ? undefined : "Find it under My charts.");
      } else if (saved.isSignedIn) {
        notify("Could not save", "Try again in a moment.", "error");
      }
    } finally {
      setSaving(false);
    }
  }, [empty, saving, savedRow, spec, saved, savedRef, encoded, notify]);

  const openSaved = useCallback(
    (c: SavedChart) => {
      reset(c.spec);
      setSavedRef({ id: c.id, encoded: encodeSpec(c.spec) });
      setSelectedId(null);
    },
    [reset]
  );

  const deleteSaved = useCallback(
    async (id: string) => {
      const ok = await saved.remove(id);
      if (ok && savedRef?.id === id) setSavedRef(null);
      if (ok) notify("Chart deleted");
      return ok;
    },
    [saved, savedRef, notify]
  );

  const seriesPanel = <SeriesPanel spec={spec} selectedId={selectedId} onSelect={setSelectedId} onChange={onChange} />;
  const templatesPanel = <TemplateGallery variant="list" onPick={pickTemplate} />;
  const designPanel = (
    <DesignPanel
      spec={spec}
      onChange={onChange}
      periods={data.chart.points.length}
      dataSource={{
        deepTickers: data.deepTickers,
        epsMissing: data.epsMissing,
        statements: data.statements,
        loading: deep.loading,
        blocked: deep.blocked,
        onLoadDeep: () => {
          const missing = data.tickers.filter((t) => !data.deepTickers.includes(t));
          // Statements come back from the cache; only the EPS call is spent.
          deep.load(missing.length > 0 ? missing : data.epsMissing, data.statements);
        },
      }}
    />
  );

  return (
    // On desktop the whole workspace fits the viewport (topbar 3.5rem + page
    // padding 4rem); the side panels scroll on their own and the canvas
    // takes the remaining height. Phones keep the natural page scroll.
    <div className={cn("flex w-full flex-col gap-4", isDesktop && !empty && "h-[calc(100dvh-7.5rem)] min-h-[520px]")}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
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
            <span className="mr-1 text-[11px] text-mist" aria-live="polite">
              {savedRow ? (
                <>
                  <span className="text-snow-peak">{savedRow.name}</span>
                  {dirty ? <span className="text-golden-hour"> · unsaved changes</span> : <span> · saved</span>}
                </>
              ) : (
                <span className="text-golden-hour">Unsaved</span>
              )}
            </span>
          )}
          <SavedChartsMenu
            charts={saved.charts}
            isLoading={saved.isLoading}
            isSignedIn={saved.isSignedIn}
            currentId={savedRef?.id ?? null}
            onOpen={openSaved}
            onRename={saved.rename}
            onDelete={deleteSaved}
            onGate={() => openGate("charts")}
          />
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
          <Button variant="secondary" size="sm" disabled={empty || saving || (savedRef !== null && !dirty)} onClick={saveChart}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {savedRef ? "Update" : "Save"}
          </Button>
          <Button size="sm" disabled={!hasPlot} onClick={() => setExportOpen(true)}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </header>

      {empty ? (
        <StartPrompt onPick={startWith} />
      ) : (
        <div className={cn("grid grid-cols-1 items-start gap-4 lg:grid-cols-[272px_minmax(0,1fr)_264px]", isDesktop && "min-h-0 flex-1 lg:items-stretch")}>
          {isDesktop && (
            <div className="flex min-h-0 flex-col gap-4">
              <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">{seriesPanel}</div>
              <div className="shrink-0">{templatesPanel}</div>
            </div>
          )}
          <div className={cn("flex min-w-0 flex-col gap-3", isDesktop && "min-h-0")}>
            <ChartFrame ref={frameRef} spec={spec} data={data} selectedId={selectedId} onSelect={setSelectedId} onChange={onChange} fill={isDesktop} className={isDesktop ? "flex-1" : undefined} />
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1">
              <ChartControls spec={spec} dates={data.dates} datesAreMonthly={data.datesAreMonthly} range={data.range} onChange={onChange} />
            </div>
          </div>
          {isDesktop && <div className="scroll-quiet min-h-0 overflow-y-auto">{designPanel}</div>}
          {/* Room for the collapsed sheet so the range controls are never under it. */}
          {!isDesktop && <div aria-hidden className="h-24" />}
        </div>
      )}

      {!empty && !isDesktop && (
        <MobileSheet
          series={
            <div className="flex flex-col gap-3">
              {seriesPanel}
              {templatesPanel}
            </div>
          }
          design={designPanel}
        />
      )}

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
