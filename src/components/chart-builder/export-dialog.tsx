"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { copyBlobToClipboard, downloadBlob, encodeSpec, pngFileName, renderChartPng, type ChartSpec } from "@/lib/chart-builder";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: ChartSpec;
  /** Returns the canvas frame element the PNG is rendered from. */
  getFrame: () => HTMLElement | null;
  onNotify: (title: string, message?: string, variant?: "success" | "warning" | "error") => void;
}

type Scale = "1" | "2" | "3";

interface Rendered {
  key: string;
  blob: Blob;
  url: string;
  dims: string;
}

/**
 * Renders the PNG once per scale and shows exactly what will be saved, so
 * "Download" never surprises. The render is keyed on spec + scale: a
 * result for another key is stale and the preview shows the skeleton.
 */
export function ExportDialog({ open, onOpenChange, spec, getFrame, onNotify }: ExportDialogProps) {
  const [scale, setScale] = useState<Scale>("2");
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const key = useMemo(() => `${encodeSpec(spec)}|${scale}`, [spec, scale]);

  useEffect(() => {
    if (!open) return;
    const frame = getFrame();
    if (!frame) return;
    let cancelled = false;
    renderChartPng(frame, spec, { scale: Number(scale) })
      .then(async (blob) => {
        const bitmap = await createImageBitmap(blob);
        const dims = `${bitmap.width} × ${bitmap.height} px · ${(blob.size / 1024).toFixed(0)} KB`;
        bitmap.close();
        // A data URL rather than an object URL: nothing to revoke, and
        // Strict Mode's double-run of effects cannot yank it from under the
        // <img>.
        const url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        if (cancelled) return;
        setRendered({ key, blob, url, dims });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError({ key, message: e instanceof Error ? e.message : "The chart could not be rendered." });
      });
    return () => {
      cancelled = true;
    };
  }, [open, getFrame, spec, scale, key]);

  const current = rendered?.key === key ? rendered : null;
  const currentError = error?.key === key ? error.message : null;
  const blob = current?.blob ?? null;
  const previewUrl = current?.url ?? null;
  const dims = current?.dims ?? "";

  const download = () => {
    if (!blob) return;
    downloadBlob(blob, pngFileName(spec));
    onNotify("PNG saved", pngFileName(spec));
    onOpenChange(false);
  };

  const copy = async () => {
    if (!blob) return;
    const ok = await copyBlobToClipboard(blob);
    if (ok) onNotify("Image copied", "Paste it anywhere that takes an image.");
    else onNotify("Could not copy", "This browser does not allow copying images; download instead.", "warning");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Export PNG</DialogTitle>
          <DialogDescription>{spec.title || "Untitled chart"}</DialogDescription>
        </DialogHeader>

        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-inset ring-wolf-border/60">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- object URL, not an asset
            <img src={previewUrl} alt="Chart export preview" className="block w-full" />
          ) : currentError ? (
            <p className="p-6 text-center text-sm text-bearish">{currentError}</p>
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center bg-wolf-black/40">
              <Skeleton className="h-full w-full" />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-mist">
            <span>Scale</span>
            <SegmentedTabs<Scale>
              items={[
                { key: "1", label: "1×" },
                { key: "2", label: "2×" },
                { key: "3", label: "3×" },
              ]}
              value={scale}
              onChange={setScale}
              ariaLabel="Export scale"
              size="sm"
            />
            <span className="font-mono tabular-nums">{blob ? dims : ""}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={!blob} onClick={copy}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy image
            </Button>
            <Button size="sm" disabled={!blob} onClick={download}>
              {blob ? <Download className="mr-1.5 h-3.5 w-3.5" /> : <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Download PNG
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
