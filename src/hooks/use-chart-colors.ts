"use client";

import { useTheme } from "@/providers/theme-provider";

/**
 * Returns theme-aware color tokens for Recharts components.
 *
 * Recharts injects colors as SVG presentation attributes which do NOT
 * support CSS `var()`, so we must resolve the correct hex value at runtime
 * based on the active theme instead of relying on CSS variable overrides.
 */
export interface ChartColors {
  /** CartesianGrid stroke */
  grid: string;
  /** XAxis / YAxis tick text fill */
  tick: string;
  /** XAxis / YAxis axisLine stroke */
  axisLine: string;
  /** activeDot / dot background stroke (matches card bg so the ring looks clean) */
  dotStroke: string;
  /** Tooltip & chart-area background */
  tooltipBg: string;
  /** Tooltip border */
  tooltipBorder: string;
  /** Chart panel background (slightly darker than card) */
  chartBg: string;
  /** Primary series color — sunset-orange, WCAG-safe in both themes */
  primary: string;
  /** Neutral/muted series color — used for estimate/projection bars */
  neutral: string;
}

export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  const isLight = theme === "light";

  return {
    grid:          isLight ? "#D0DBDF" : "#2A3B40",
    tick:          isLight ? "#4E6E78" : "#8C9DA1",
    axisLine:      isLight ? "#D0DBDF" : "#2A3B40",
    dotStroke:     isLight ? "#FFFFFF" : "#0B1416",
    tooltipBg:     isLight ? "#FFFFFF" : "#0B1416",
    tooltipBorder: isLight ? "#D0DBDF" : "#2A3B40",
    chartBg:       isLight ? "#F4F7F8" : "#081317",
    primary:       isLight ? "#C85D14" : "#FF8C42",
    neutral:       isLight ? "#8FAAB3" : "#4E6E78",
  };
}
