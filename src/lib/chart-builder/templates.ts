/**
 * Chart Builder — starting points.
 *
 * Each template is a complete `ChartSpec` factory over the tickers already
 * on the chart. Nothing is seeded on its own: a company only reaches a
 * chart — and a data source only gets called — when the user adds it.
 */

import { createSeries, createSpec, type ChartSpec } from "./spec";
import { paletteColor } from "./themes";

export type TemplateId =
  | "revenue-race"
  | "price-indexed"
  | "fcf-vs-price"
  | "margins"
  | "capital-returns"
  | "valuation";

export interface ChartTemplate {
  id: TemplateId;
  name: string;
  description: string;
  /** How many tickers the template uses at most. */
  tickers: number;
  build: (tickers: string[]) => ChartSpec;
}

/** Up to `n` of the given tickers; never invents one. */
function pick(tickers: string[], n: number): string[] {
  return Array.from(new Set(tickers.map((t) => t.toUpperCase()))).slice(0, n);
}

export const TEMPLATES: readonly ChartTemplate[] = [
  {
    id: "revenue-race",
    name: "Revenue race",
    description: "Quarterly revenue of several companies, stacked.",
    tickers: 4,
    build: (tickers) => {
      const t = pick(tickers, 4);
      return createSpec({
        title: `${t.join(", ")} — Revenue`,
        subtitle: "Quarterly revenue, stacked · aligned by calendar quarter",
        granularity: "quarterly",
        series: t.map((ticker, i) =>
          createSeries({ ticker, metric: "revenue", shape: "bar", color: paletteColor(i) })
        ),
        style: { theme: "parchment", stacked: true, barRadius: 0, valueLabels: "last" },
      });
    },
  },
  {
    id: "price-indexed",
    name: "Price, indexed",
    description: "Two or more share prices as percent change from a common start.",
    tickers: 2,
    build: (tickers) => {
      const t = pick(tickers, 2);
      return createSpec({
        title: `${t.join(", ")} — Stock price`,
        subtitle: "Indexed to zero (%)",
        granularity: "quarterly",
        series: t.map((ticker, i) =>
          createSeries({ ticker, metric: "price", transform: "indexed", shape: "line", color: paletteColor(i === 1 ? 4 : i) })
        ),
        style: { theme: "snow", aspect: "1:1", lineWidth: 2.5, valueLabels: "ends" },
      });
    },
  },
  {
    id: "fcf-vs-price",
    name: "FCF/share vs. price",
    description: "Free cash flow per share (bars) against the share price (line).",
    tickers: 1,
    build: (tickers) => {
      const [ticker] = pick(tickers, 1);
      if (!ticker) return createSpec({ title: "" });
      return createSpec({
        title: `${ticker} — FCF/share vs. price`,
        subtitle: "Quarterly free cash flow per share against the daily close",
        granularity: "quarterly",
        series: [
          createSeries({ ticker, metric: "free_cash_flow", transform: "per_share", shape: "bar", axis: "right", color: paletteColor(0) }),
          createSeries({ ticker, metric: "price", shape: "line", axis: "left", color: "#F2F4F3" }),
        ],
        style: { theme: "wolf", valueLabels: "ends" },
      });
    },
  },
  {
    id: "margins",
    name: "Margins",
    description: "Gross, operating and net margin of one company.",
    tickers: 1,
    build: (tickers) => {
      const [ticker] = pick(tickers, 1);
      if (!ticker) return createSpec({ title: "" });
      return createSpec({
        title: `${ticker} — Margins`,
        subtitle: "Annual, as a percentage of revenue",
        granularity: "annual",
        series: [
          createSeries({ ticker, metric: "gross_margin", shape: "line", color: paletteColor(0) }),
          createSeries({ ticker, metric: "operating_margin", shape: "line", color: paletteColor(1) }),
          createSeries({ ticker, metric: "net_margin", shape: "line", color: paletteColor(3) }),
        ],
        style: { theme: "wolf", valueLabels: "last" },
      });
    },
  },
  {
    id: "capital-returns",
    name: "Capital returned",
    description: "Dividends and buybacks, stacked, next to free cash flow.",
    tickers: 1,
    build: (tickers) => {
      const [ticker] = pick(tickers, 1);
      if (!ticker) return createSpec({ title: "" });
      return createSpec({
        title: `${ticker} — Capital returned to shareholders`,
        subtitle: "Annual dividends and buybacks against free cash flow",
        granularity: "annual",
        series: [
          createSeries({ ticker, metric: "dividends_paid", shape: "bar", color: paletteColor(2) }),
          createSeries({ ticker, metric: "share_repurchases", shape: "bar", color: paletteColor(0) }),
          createSeries({ ticker, metric: "free_cash_flow", shape: "line", color: "#F2F4F3" }),
        ],
        style: { theme: "wolf", stacked: true, valueLabels: "last" },
      });
    },
  },
  {
    id: "valuation",
    name: "Valuation vs. growth",
    description: "Trailing P/E against year-over-year revenue growth.",
    tickers: 1,
    build: (tickers) => {
      const [ticker] = pick(tickers, 1);
      if (!ticker) return createSpec({ title: "" });
      return createSpec({
        title: `${ticker} — P/E vs. revenue growth`,
        subtitle: "Trailing twelve months, quarterly",
        granularity: "quarterly",
        series: [
          createSeries({ ticker, metric: "pe_ttm", shape: "area", axis: "left", color: paletteColor(0) }),
          createSeries({ ticker, metric: "revenue", transform: "yoy", shape: "line", axis: "right", color: paletteColor(1) }),
        ],
        style: { theme: "wolf", valueLabels: "last" },
      });
    },
  },
];

export function getTemplate(id: TemplateId): ChartTemplate {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown template "${id}"`);
  return t;
}
