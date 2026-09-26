/**
 * Chart Builder — PNG export, browser-only, no dependencies.
 *
 * The on-screen chart is an SVG (Recharts) framed by HTML (title, legend,
 * watermark). The export composes the same picture on a 2D canvas: the
 * HTML parts are drawn with canvas text — document fonts are available
 * there — and the SVG is rasterised through an <img>, which has no access
 * to the page's fonts, so the faces it uses are inlined as @font-face data
 * URIs first.
 */

import { brandMarkSvg } from "@/components/ui/brand-mark";
import { CANVAS_THEMES, seriesInk } from "./themes";
import { seriesLabel } from "./resolve";
import type { ChartSpec, AspectRatio } from "./spec";

export interface ExportOptions {
  /** Device-pixel multiplier: 1, 2 or 3. */
  scale?: number;
  /** Override the frame width in CSS pixels (height follows the aspect). */
  width?: number;
}

const EXPORT_WIDTH: Record<AspectRatio, number> = { "16:9": 1200, "4:3": 1100, "1:1": 900 };
const PAD = 40;

function fontFamily(varName: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return raw || "system-ui, sans-serif";
}

/** First family name in a font-family list, unquoted. */
function primaryFamily(list: string): string {
  return list.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
}

let fontFaceCache: Promise<string> | null = null;

/**
 * @font-face rules for the page's heading and mono faces with their files
 * inlined. next/font serves the files same-origin, so they can be fetched.
 */
async function inlinedFontFaces(families: string[]): Promise<string> {
  if (fontFaceCache) return fontFaceCache;
  fontFaceCache = (async () => {
    const rules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let cssRules: CSSRuleList;
      try {
        cssRules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet
      }
      for (const rule of Array.from(cssRules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const family = rule.style.getPropertyValue("font-family").replace(/['"]/g, "").trim();
        if (!families.includes(family)) continue;
        const src = rule.style.getPropertyValue("src");
        const url = /url\(["']?([^"')]+)["']?\)/.exec(src)?.[1];
        if (!url) continue;
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const dataUri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          rules.push(rule.cssText.replace(src, `url("${dataUri}")`));
        } catch {
          // One face failing is not a reason to fail the export.
        }
      }
    }
    if (rules.length === 0) console.warn("[chart-builder] No @font-face rules found to embed; tick labels fall back to the viewer's fonts.");
    return rules.join("\n");
  })();
  return fontFaceCache;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Letter-spaced text: canvas has no reliable letterSpacing across browsers. */
function measureTracked(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + tracking;
  return w - tracking;
}
function fillTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number): void {
  const align = ctx.textAlign;
  ctx.textAlign = "left";
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  ctx.textAlign = align;
}

function svgToImage(svgMarkup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("SVG could not be rasterised"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  });
}

/**
 * Renders the chart to a PNG blob. `frame` is the canvas frame element
 * (the one with the title, legend and the Recharts SVG inside).
 */
export async function renderChartPng(frame: HTMLElement, spec: ChartSpec, options: ExportOptions = {}): Promise<Blob> {
  const scale = options.scale ?? 2;
  const theme = CANVAS_THEMES[spec.style.theme];
  const svgEl = frame.querySelector<SVGSVGElement>("svg.recharts-surface");
  if (!svgEl) throw new Error("No chart to export");

  const headingFont = fontFamily("--font-heading");
  const monoFont = fontFamily("--font-mono");

  const width = options.width ?? EXPORT_WIDTH[spec.style.aspect];
  const plotWidth = width - PAD * 2;
  // The plot keeps the proportions it has on screen (the frame already
  // sizes it to the spec's aspect), so text is scaled, never stretched.
  const vbW = svgEl.viewBox.baseVal.width || svgEl.clientWidth;
  const vbH = svgEl.viewBox.baseVal.height || svgEl.clientHeight;
  const plotHeight = Math.round((plotWidth * vbH) / vbW);

  // --- SVG with fonts inlined and CSS variables resolved -------------------
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(plotWidth));
  clone.setAttribute("height", String(plotHeight));
  clone.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  const faces = await inlinedFontFaces([primaryFamily(headingFont), primaryFamily(monoFont)]);
  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleEl.textContent = faces;
  clone.insertBefore(styleEl, clone.firstChild);
  const markup = new XMLSerializer()
    .serializeToString(clone)
    .replace(/var\(--font-mono\)/g, monoFont)
    .replace(/var\(--font-heading\)/g, headingFont);
  const img = await svgToImage(markup);

  // --- Compose -------------------------------------------------------------
  const titleSize = 26;
  const subtitleSize = 14;
  const legendSize = 13;
  const series = spec.series.filter((s) => !s.hidden);
  const legendOn = spec.style.legend !== "hidden" && series.length > 0;

  let y = PAD;
  const titleH = spec.title ? titleSize * 1.25 : 0;
  const subH = spec.subtitle ? subtitleSize * 1.5 : 0;
  const legendH = legendOn ? legendSize * 2 : 0;
  const footerH = 36;
  const height = Math.round(PAD + titleH + subH + (spec.style.legend === "top" ? legendH : 0) + 10 + plotHeight + (spec.style.legend === "bottom" ? legendH : 0) + footerH + PAD / 2);

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.scale(scale, scale);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "top";

  if (spec.title) {
    ctx.font = `600 ${titleSize}px ${headingFont}`;
    ctx.fillStyle = theme.title;
    ctx.textAlign = "center";
    ctx.fillText(spec.title, width / 2, y, plotWidth);
    y += titleH;
  }
  if (spec.subtitle) {
    ctx.font = `400 ${subtitleSize}px ${headingFont}`;
    ctx.fillStyle = theme.tick;
    ctx.textAlign = "center";
    ctx.fillText(spec.subtitle, width / 2, y + 2, plotWidth);
    y += subH;
  }

  const drawLegend = (top: number) => {
    ctx.font = `500 ${legendSize}px ${monoFont}`;
    ctx.textAlign = "left";
    const gap = 22;
    const items = series.map((s) => {
      const label = seriesLabel(s, spec.granularity);
      return { s, label, w: 18 + ctx.measureText(label).width };
    });
    const total = items.reduce((a, i) => a + i.w, 0) + gap * (items.length - 1);
    let x = Math.max(PAD, (width - total) / 2);
    for (const { s, label, w } of items) {
      ctx.fillStyle = seriesInk(s.color, spec.style.theme);
      if (s.shape === "bar") {
        ctx.beginPath();
        ctx.roundRect(x, top + 2, 12, 12, 3);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.roundRect(x, top + 6.5, 16, 3, 1.5);
        ctx.fill();
      }
      ctx.fillStyle = theme.legendText;
      ctx.fillText(label, x + 18 + (s.shape === "bar" ? 0 : 4), top);
      x += w + gap + (s.shape === "bar" ? 0 : 4);
    }
  };

  if (legendOn && spec.style.legend === "top") {
    drawLegend(y + 4);
    y += legendH;
  }
  y += 10;
  ctx.drawImage(img, PAD, y, plotWidth, plotHeight);
  y += plotHeight;
  if (legendOn && spec.style.legend === "bottom") {
    drawLegend(y + 8);
    y += legendH;
  }

  // Watermark, always: "Powered by  [logo] HUNTR", bottom right.
  {
    // The mark in the chart's own title colour, so it reads on light exports too.
    const mark = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brandMarkSvg(theme.title))}`;
    const logo = await loadImage(mark).catch(() => null);
    const wordSize = 18;
    ctx.textBaseline = "middle";
    const baseline = y + 16;
    // Same proportions as the app's own wordmark: bold, tight tracking, the mark a touch taller than the word.
    ctx.font = `700 ${wordSize}px ${headingFont}`;
    const tracking = wordSize * -0.025;
    const wordW = measureTracked(ctx, "HUNTR", tracking);
    let x = width - PAD;
    x -= wordW;
    ctx.fillStyle = theme.title;
    fillTracked(ctx, "HUNTR", x, baseline, tracking);
    if (logo) {
      const h = 26;
      const w = (logo.width / logo.height) * h;
      x -= w + 8;
      ctx.drawImage(logo, x, baseline - h / 2, w, h);
    }
    ctx.font = `400 14px ${headingFont}`;
    ctx.fillStyle = theme.tick;
    const lead = "Powered by";
    x -= ctx.measureText(lead).width + 10;
    ctx.fillText(lead, x, baseline);
    ctx.textBaseline = "top";
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
  });
}

export function pngFileName(spec: ChartSpec): string {
  const slug = (spec.title || "chart")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `huntr-${slug || "chart"}.png`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copies a PNG to the clipboard; false when the browser refuses. */
export async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
