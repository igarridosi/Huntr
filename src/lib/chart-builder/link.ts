/**
 * Chart Builder — deep links from elsewhere in the app.
 *
 * Kept tiny on purpose: a ticker page only needs to build a URL, not the
 * resolver or the canvas.
 */

import { METRICS, type MetricId } from "./metrics";

export type { MetricId };
import { createSeries, createSpec } from "./spec";
import { SPEC_QUERY_PARAM, encodeSpec } from "./url";

export const CHART_BUILDER_PATH = "/app/chart-builder";

/** `/app/chart-builder?c=…` opening one metric of one company as a bar chart. */
export function chartBuilderHref(ticker: string, metric: MetricId): string {
  const t = ticker.toUpperCase();
  const def = METRICS[metric];
  const shape = def.unit === "percent" || def.unit === "ratio" || def.source === "price" ? "line" : "bar";
  const spec = createSpec({
    title: `${t} — ${def.label}`,
    subtitle: "Quarterly",
    series: [createSeries({ ticker: t, metric, shape })],
  });
  return `${CHART_BUILDER_PATH}?${SPEC_QUERY_PARAM}=${encodeSpec(spec)}`;
}
