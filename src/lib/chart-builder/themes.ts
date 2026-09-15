/**
 * Chart Builder — canvas themes and the series palette.
 *
 * The canvas is an exportable artifact, so it carries its own theme
 * independently of the app's light/dark chrome. `wolf` and `snow` mirror
 * the dark and light values in `useChartColors()`; `parchment` is the warm
 * off-white that reads well when a chart is pasted into a document.
 */

import type { CanvasTheme } from "./spec";

export interface CanvasTokens {
  name: string;
  /** Canvas background. */
  bg: string;
  /** Plot area, one step off the background. */
  plot: string;
  grid: string;
  tick: string;
  title: string;
  legendText: string;
  /** Value-label pill. */
  labelBg: string;
  labelText: string;
  ring: string;
  /**
   * Palette entries that fall under 3:1 (WCAG 1.4.11, non-text) against
   * `bg` are swapped for a darker cousin here, so the palette itself stays
   * the same across themes and only the ink changes.
   */
  seriesOverrides: Record<string, string>;
}

const LIGHT_OVERRIDES: Record<string, string> = {
  "#FFBF69": "#D99A2B",
  "#A3B2B8": "#6F8288",
  "#34D399": "#1E9E6C",
  "#F2F4F3": "#0B1416",
};

export const CANVAS_THEMES: Record<CanvasTheme, CanvasTokens> = {
  wolf: {
    name: "Wolf",
    bg: "#0B1416",
    plot: "#081317",
    grid: "#34474D",
    tick: "#8C9DA1",
    title: "#F2F4F3",
    legendText: "#C9D2D5",
    labelBg: "#162225",
    labelText: "#F2F4F3",
    ring: "#2A3B40",
    seriesOverrides: {},
  },
  navy: {
    name: "Navy",
    bg: "#1B2436",
    plot: "#1B2436",
    grid: "#2E3B54",
    tick: "#A3AEC4",
    title: "#F4F6FA",
    legendText: "#D6DCE8",
    labelBg: "#0E1422",
    labelText: "#FFFFFF",
    ring: "#2E3B54",
    seriesOverrides: {},
  },
  snow: {
    name: "Snow",
    bg: "#FFFFFF",
    plot: "#F4F7F8",
    grid: "#D0DBDF",
    tick: "#4E6E78",
    title: "#0B1416",
    legendText: "#23343A",
    labelBg: "#0B1416",
    labelText: "#FFFFFF",
    ring: "#D0DBDF",
    seriesOverrides: LIGHT_OVERRIDES,
  },
  parchment: {
    name: "Parchment",
    bg: "#FFFBEF",
    plot: "#FFF7E3",
    grid: "#E6E0CC",
    tick: "#5E5A4E",
    title: "#1B1B1B",
    legendText: "#2B2A24",
    labelBg: "#1B1B1B",
    labelText: "#FFFBEF",
    ring: "#E6E0CC",
    seriesOverrides: LIGHT_OVERRIDES,
  },
};

/** Default series colours, assigned by series index. */
export const SERIES_PALETTE: readonly string[] = [
  "#FF8C42", // sunset orange — the brand accent leads
  "#4DA3FF", // sky
  "#FFBF69", // golden hour
  "#7C8CF8", // indigo
  "#34D399", // mint
  "#F472B6", // rose
  "#A3B2B8", // light mist
  "#C9A227", // ochre
];

export function paletteColor(index: number): string {
  return SERIES_PALETTE[((index % SERIES_PALETTE.length) + SERIES_PALETTE.length) % SERIES_PALETTE.length];
}

/** The colour to actually paint a series with on a given theme. */
export function seriesInk(color: string, theme: CanvasTheme): string {
  const key = color.toUpperCase();
  const overrides = CANVAS_THEMES[theme].seriesOverrides;
  return overrides[key] ?? overrides[color] ?? color;
}
