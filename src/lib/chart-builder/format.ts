/**
 * Chart Builder — value formatting by unit.
 *
 * Axis ticks are compact ("$1.8T", "+12%"); tooltips and value labels get
 * the full figure ("$2.60", "24.1x"). One place, so the axis, the pill and
 * the tooltip never disagree on how a number reads.
 */

import type { MetricUnit } from "./metrics";
import type { AxisFormat } from "./spec";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function signed(text: string, v: number): string {
  return v > 0 ? `+${text}` : text;
}

/** Full-precision rendering for tooltips and value labels. */
export function formatValue(unit: MetricUnit, v: number): string {
  if (!Number.isFinite(v)) return "—";
  switch (unit) {
    case "currency":
      return compactMoney.format(v);
    case "shares":
      return compact.format(v);
    case "per_share":
    case "price":
      return money.format(v);
    case "percent":
      return signed(`${plain.format(v)}%`, v);
    case "ratio":
      return `${plain.format(v)}x`;
  }
}

/** Short rendering for axis ticks. */
export function formatTick(unit: MetricUnit | null, v: number): string {
  if (unit === null) return compact.format(v);
  switch (unit) {
    case "currency":
      return compactMoney.format(v);
    case "shares":
      return compact.format(v);
    case "per_share":
    case "price":
      return money.format(v);
    case "percent":
      return signed(`${plain.format(v)}%`, v);
    case "ratio":
      return `${plain.format(v)}x`;
  }
}

/** The unit an axis is formatted in once the user's override is applied. */
export function effectiveAxisUnit(unit: MetricUnit | null, override: AxisFormat): MetricUnit | null {
  switch (override) {
    case "currency":
      return "currency";
    case "percent":
      return "percent";
    case "number":
      return null;
    default:
      return unit;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jul '21" for time-axis ticks. */
export function formatMonthTick(epochMs: number): string {
  const d = new Date(epochMs);
  return `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
}

/** "12 Jul 2021" for tooltips on the time axis. */
export function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
