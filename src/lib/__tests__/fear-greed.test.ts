import { describe, expect, it } from "vitest";
import { computeFearGreed, extremesOf, percentileAt, pointsIn, zoneOf, type FearGreedSymbol } from "../fear-greed";

/** `days` trading days from 2025-01-01, weekends skipped. */
function tradingDays(days: number, start = "2025-01-01"): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (out.length < days) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const series = (dates: string[], f: (i: number) => number) => dates.map((date, i) => ({ date, close: f(i) }));

/**
 * A market that drifts sideways for `calm` days, then turns: a `turn` of +1
 * rallies (stocks, junk bonds and the average stock up, bonds and the VIX
 * down), -1 sells off (all of it the other way).
 */
function market(dates: string[], calm: number, turn: 1 | -1) {
  const after = (i: number) => Math.max(0, i - calm);
  const wiggle = (i: number, p: number) => Math.sin(i / p);
  const history: Partial<Record<FearGreedSymbol, Array<{ date: string; close: number }>>> = {
    "^GSPC": series(dates, (i) => 4000 + wiggle(i, 5) * 30 + turn * after(i) * 25),
    "^VIX": series(dates, (i) => Math.max(9, 18 + wiggle(i, 6) - turn * after(i) * 0.6)),
    HYG: series(dates, (i) => 80 + wiggle(i, 9) * 0.3 + turn * after(i) * 0.08),
    IEF: series(dates, (i) => 95 + wiggle(i, 11) * 0.3),
    SPY: series(dates, (i) => 400 + wiggle(i, 5) * 3 + turn * after(i) * 2.5),
    TLT: series(dates, (i) => 90 + wiggle(i, 13) * 0.5 - turn * after(i) * 0.15),
    RSP: series(dates, (i) => 170 + wiggle(i, 7) + turn * after(i) * 1.6),
  };
  return history;
}

describe("percentileAt", () => {
  it("places the latest value among the past year", () => {
    const values = Array.from({ length: 300 }, (_, i) => i);
    expect(percentileAt(values, 299)).toBe(100);
    const flat = Array.from({ length: 300 }, () => 5);
    expect(percentileAt(flat, 299)).toBe(50);
    expect(percentileAt([...values.slice(0, 299), -1], 299)).toBe(0);
  });

  it("needs half a year to compare against", () => {
    expect(percentileAt(Array.from({ length: 100 }, (_, i) => i), 99)).toBeNull();
  });
});

describe("computeFearGreed", () => {
  const dates = tradingDays(520);

  it("reads a broad rally as greed", () => {
    const last = computeFearGreed(market(dates, 490, 1)).at(-1)!;
    expect(last.value).toBeGreaterThan(80);
    expect(last.components.momentum).toBeGreaterThan(90);
    expect(last.components.volatility).toBeGreaterThan(90);
  });

  it("reads a broad sell-off as fear", () => {
    const last = computeFearGreed(market(dates, 490, -1)).at(-1)!;
    expect(last.value).toBeLessThan(20);
    expect(last.components.momentum).toBeLessThan(10);
    expect(last.components.safeHaven).toBeLessThan(10);
  });

  it("starts only once a year of history can score three signals, and stays within 0 to 100", () => {
    const points = computeFearGreed(market(dates, dates.length, 1));
    expect(points.length).toBeGreaterThan(0);
    expect(points[0].date > dates[100]).toBe(true);
    expect(points.every((p) => p.value >= 0 && p.value <= 100)).toBe(true);
  });

  it("carries a symbol's last close over a day it did not trade", () => {
    const history = market(dates, 400, 1);
    history.HYG = history.HYG!.filter((_, i) => i % 7 !== 3);
    const last = computeFearGreed(history).at(-1)!;
    expect(last.components.junk).toBeDefined();
  });

  it("is empty without the S&P 500", () => {
    expect(computeFearGreed({ "^VIX": series(dates, () => 20) })).toEqual([]);
  });
});

describe("ranges and zones", () => {
  const points = tradingDays(300, "2025-06-02").map((date, i) => ({ date, value: (i * 7) % 100, components: {} }));

  it("cuts the week, the month and the year so far", () => {
    expect(pointsIn(points, "1W")).toHaveLength(6);
    expect(pointsIn(points, "1M")).toHaveLength(22);
    const ytd = pointsIn(points, "YTD");
    expect(ytd.every((p) => p.date.startsWith("2026"))).toBe(true);
    expect(ytd[0].date).toBe("2026-01-01");
  });

  it("names the extremes and the zones", () => {
    const ext = extremesOf([
      { date: "a", value: 40, components: {} },
      { date: "b", value: 12, components: {} },
      { date: "c", value: 81, components: {} },
    ])!;
    expect([ext.low.date, ext.high.date]).toEqual(["b", "c"]);
    expect(zoneOf(12).label).toBe("Extreme fear");
    expect(zoneOf(50).label).toBe("Neutral");
    expect(zoneOf(100).label).toBe("Extreme greed");
  });
});
