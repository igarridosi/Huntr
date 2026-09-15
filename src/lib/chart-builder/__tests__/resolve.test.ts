import { describe, expect, it } from "vitest";
import {
  applyTransform,
  assignAxes,
  bundlePeriods,
  indexValues,
  priceAt,
  resolveChart,
  seriesLabel,
  toCalendarBucket,
  unitOf,
} from "../resolve";
import { createSeries, createSpec } from "../spec";
import { fin, prices, quarterEnds } from "./fixtures";

const col = (chart: ReturnType<typeof resolveChart>, id: string) => chart.points.map((p) => p[id]);

describe("toCalendarBucket", () => {
  it("puts a September fiscal quarter end in calendar Q3", () => {
    // Apple's FY Q4 ends 2024-09-28 and must line up with everyone's Q3.
    expect(toCalendarBucket("2024-09-28", "quarterly")).toMatchObject({ key: 2024 * 4 + 2, label: "Q3 2024" });
  });

  it("buckets annual periods by the year of the period end", () => {
    expect(toCalendarBucket("2024-06-30", "annual")).toMatchObject({ key: 2024, label: "2024" });
  });

  it("rejects dates that are not ISO", () => {
    expect(toCalendarBucket("June 2024", "annual")).toBeNull();
  });
});

describe("bundlePeriods", () => {
  it("joins the three statements of one bucket into one bundle", () => {
    const f = fin("X", { annual: [{ date: "2023-12-31", revenue: 100, fcf: 20, equity: 50 }] });
    const [b] = bundlePeriods(f, "annual");
    expect(b.income?.revenue).toBe(100);
    expect(b.cashflow?.free_cash_flow).toBe(20);
    expect(b.balance?.total_equity).toBe(50);
  });

  it("keeps statements with different period ends in the same bucket together", () => {
    // Income says 2023-12-30, cash flow says 2023-12-31: same quarter.
    const f = fin("X", { annual: [{ date: "2023-12-30", revenue: 100 }] }, { statements: ["income"] });
    const g = fin("X", { annual: [{ date: "2023-12-31", fcf: 20 }] }, { statements: ["cashflow"] });
    f.cash_flow = g.cash_flow;
    const bundles = bundlePeriods(f, "annual");
    expect(bundles).toHaveLength(1);
    expect(bundles[0].date).toBe("2023-12-31");
  });

  it("returns bundles oldest first regardless of input order", () => {
    const f = fin("X", { annual: [{ date: "2021-12-31" }, { date: "2022-12-31" }, { date: "2023-12-31" }] });
    expect(bundlePeriods(f, "annual").map((b) => b.bucket.label)).toEqual(["2021", "2022", "2023"]);
  });
});

describe("priceAt", () => {
  const p = prices("2024-01-01", 10, (i) => 100 + i); // 2024-01-01 … 2024-01-10

  it("returns the last close on or before the date", () => {
    expect(priceAt(p, "2024-01-05")).toBe(104);
  });

  it("returns null when the nearest close is too far back", () => {
    expect(priceAt(p, "2024-03-01")).toBeNull();
  });

  it("returns null before the first close", () => {
    expect(priceAt(p, "2023-12-31")).toBeNull();
  });
});

describe("applyTransform", () => {
  const dates = quarterEnds(2023, 2024); // 8 quarters
  const f = fin("X", { quarterly: dates.map((date, i) => ({ date, revenue: 10 * (i + 1), shares: 5 })) });
  const bundles = bundlePeriods(f, "quarterly");
  const raw = new Map(bundles.map((b) => [b.bucket.key, b.income!.revenue] as const));

  it("ttm sums four consecutive quarters and leaves the first three null", () => {
    const out = [...applyTransform(raw, "ttm", "quarterly", bundles).values()];
    expect(out.slice(0, 3)).toEqual([null, null, null]);
    expect(out[3]).toBe(10 + 20 + 30 + 40);
    expect(out[7]).toBe(50 + 60 + 70 + 80);
  });

  it("ttm is null across a gap in the quarters", () => {
    const gappy = new Map(raw);
    gappy.delete(2023 * 4 + 2); // drop Q3 2023
    const out = applyTransform(gappy, "ttm", "quarterly", bundles);
    expect(out.get(2024 * 4 + 0)).toBeNull(); // Q1 2024 needs Q2–Q4 2023
    expect(out.get(2024 * 4 + 2)).toBe(40 + 50 + 60 + 70); // Q3 2024 is clear of the gap
  });

  it("yoy compares with the same quarter a year earlier", () => {
    const out = applyTransform(raw, "yoy", "quarterly", bundles);
    expect(out.get(2023 * 4 + 0)).toBeNull();
    expect(out.get(2024 * 4 + 0)).toBeCloseTo((50 / 10 - 1) * 100);
  });

  it("yoy is null when the base is zero or negative", () => {
    const neg = new Map([[2023 * 4, -5], [2024 * 4, 10]]);
    expect(applyTransform(neg, "yoy", "quarterly", bundles).get(2024 * 4)).toBeNull();
  });

  it("per_share divides by that period's diluted shares", () => {
    expect(applyTransform(raw, "per_share", "quarterly", bundles).get(2023 * 4)).toBe(2);
  });
});

describe("indexValues", () => {
  it("rebases on the first non-null value", () => {
    const out = indexValues([{ value: null }, { value: 50 }, { value: 75 }, { value: 25 }]);
    expect(out.map((p) => p.value)).toEqual([null, 0, 50, -50]);
  });
});

describe("unitOf / seriesLabel", () => {
  it("indexed and yoy are percent, per_share is per share", () => {
    expect(unitOf(createSeries({ ticker: "A", metric: "price", transform: "indexed" }))).toBe("percent");
    expect(unitOf(createSeries({ ticker: "A", metric: "revenue", transform: "yoy" }))).toBe("percent");
    expect(unitOf(createSeries({ ticker: "A", metric: "revenue", transform: "per_share" }))).toBe("per_share");
    expect(unitOf(createSeries({ ticker: "A", metric: "pe_ttm" }))).toBe("ratio");
  });

  it("labels read TICKER · Short with the transform suffix", () => {
    expect(seriesLabel(createSeries({ ticker: "nflx", metric: "free_cash_flow", transform: "per_share" }))).toBe("NFLX · FCF/sh");
    expect(seriesLabel(createSeries({ ticker: "AAPL", metric: "revenue", transform: "ttm" }))).toBe("AAPL · Rev TTM");
    expect(seriesLabel(createSeries({ ticker: "AAPL", metric: "revenue", label: "Sales" }))).toBe("Sales");
  });
});

describe("assignAxes", () => {
  it("moves a clashing unit to the free axis with a warning", () => {
    const r = assignAxes([
      { id: "a", axis: "left", unit: "currency" },
      { id: "b", axis: "left", unit: "percent" },
    ]);
    expect(r.axes).toEqual({ left: "currency", right: "percent" });
    expect(r.axisOf.get("b")).toBe("right");
    expect(r.warnings).toHaveLength(1);
  });

  it("keeps the series where it is when both axes are taken", () => {
    const r = assignAxes([
      { id: "a", axis: "left", unit: "currency" },
      { id: "b", axis: "right", unit: "percent" },
      { id: "c", axis: "left", unit: "ratio" },
    ]);
    expect(r.axisOf.get("c")).toBe("left");
    expect(r.warnings[0].message).toMatch(/mixes units/);
  });
});

describe("resolveChart — category mode", () => {
  it("aligns a June filer and a December filer on the calendar year", () => {
    const msft = fin("MSFT", { annual: [{ date: "2023-06-30", revenue: 200 }, { date: "2024-06-30", revenue: 245 }] });
    const goog = fin("GOOGL", { annual: [{ date: "2023-12-31", revenue: 300 }, { date: "2024-12-31", revenue: 350 }] });
    const spec = createSpec({
      granularity: "annual",
      series: [
        createSeries({ id: "m", ticker: "MSFT", metric: "revenue" }),
        createSeries({ id: "g", ticker: "GOOGL", metric: "revenue" }),
      ],
    });
    const chart = resolveChart(spec, { financials: { MSFT: msft, GOOGL: goog }, prices: {} });
    expect(chart.xMode).toBe("category");
    expect(chart.xLabels).toEqual(["2023", "2024"]);
    expect(col(chart, "m")).toEqual([200, 245]);
    expect(col(chart, "g")).toEqual([300, 350]);
  });

  const staggered = () => ({
    A: fin("A", { annual: [{ date: "2022-12-31", revenue: 1 }, { date: "2023-12-31", revenue: 2 }] }),
    B: fin("B", { annual: [{ date: "2023-12-31", revenue: 5 }, { date: "2024-12-31", revenue: 6 }] }),
  });
  const twoSeries = [createSeries({ id: "a", ticker: "A", metric: "revenue" }), createSeries({ id: "b", ticker: "B", metric: "revenue" })];

  it("with align=all fills the union of buckets with nulls where a series has no data", () => {
    const chart = resolveChart(createSpec({ granularity: "annual", align: "all", series: twoSeries }), { financials: staggered(), prices: {} });
    expect(chart.xLabels).toEqual(["2022", "2023", "2024"]);
    expect(col(chart, "a")).toEqual([1, 2, null]);
    expect(col(chart, "b")).toEqual([null, 5, 6]);
    expect(chart.series[0].last).toEqual({ x: 1, value: 2 });
    expect(chart.series[1].first).toEqual({ x: 1, value: 5 });
  });

  it("with align=common (the default) keeps only the periods every series reports", () => {
    const chart = resolveChart(createSpec({ granularity: "annual", series: twoSeries }), { financials: staggered(), prices: {} });
    expect(chart.xLabels).toEqual(["2023"]);
    expect(col(chart, "a")).toEqual([2]);
    expect(col(chart, "b")).toEqual([5]);
    expect(chart.series[0].first).toEqual({ x: 0, value: 2 });
  });

  it("align=common ignores a series with no data at all instead of emptying the chart", () => {
    const chart = resolveChart(
      createSpec({ granularity: "annual", series: [...twoSeries, createSeries({ id: "z", ticker: "ZZZ", metric: "revenue" })] }),
      { financials: { ...staggered(), ZZZ: null }, prices: {} }
    );
    expect(chart.xLabels).toEqual(["2023"]);
  });

  it("applies the range by period end and indexes inside it", () => {
    const a = fin("A", { annual: [2020, 2021, 2022, 2023].map((y) => ({ date: `${y}-12-31`, revenue: y - 2019 })) });
    const spec = createSpec({
      granularity: "annual",
      range: { from: "2022-01-01", to: null },
      series: [createSeries({ id: "a", ticker: "A", metric: "revenue", transform: "indexed", shape: "line" })],
    });
    const chart = resolveChart(spec, { financials: { A: a }, prices: {} });
    expect(chart.xLabels).toEqual(["2022", "2023"]);
    expect(col(chart, "a")).toEqual([0, (4 / 3 - 1) * 100]);
  });

  it("reads capex, dividends and buybacks as positive outflows", () => {
    const a = fin("A", { annual: [{ date: "2023-12-31", capex: -40, dividends: -10, buybacks: -30 }] });
    const spec = createSpec({
      granularity: "annual",
      series: [
        createSeries({ id: "c", ticker: "A", metric: "capex" }),
        createSeries({ id: "r", ticker: "A", metric: "shareholder_returns" }),
      ],
    });
    const chart = resolveChart(spec, { financials: { A: a }, prices: {} });
    expect(col(chart, "c")).toEqual([40]);
    expect(col(chart, "r")).toEqual([40]);
  });

  it("computes margins as a percentage and nulls them on zero revenue", () => {
    const a = fin("A", { annual: [{ date: "2022-12-31", revenue: 0, net_income: 1 }, { date: "2023-12-31", revenue: 200, net_income: 50 }] });
    const spec = createSpec({ granularity: "annual", series: [createSeries({ id: "m", ticker: "A", metric: "net_margin", shape: "line" })] });
    const chart = resolveChart(spec, { financials: { A: a }, prices: {} });
    expect(col(chart, "m")).toEqual([null, 25]);
  });

  it("warns and yields an empty series for a ticker without statements", () => {
    const spec = createSpec({ series: [createSeries({ id: "z", ticker: "ZZZ", metric: "revenue" })] });
    const chart = resolveChart(spec, { financials: { ZZZ: null }, prices: {} });
    expect(chart.points).toEqual([]);
    expect(chart.series[0].count).toBe(0);
    expect(chart.warnings[0].message).toMatch(/No financial statements for ZZZ/);
  });
});

describe("resolveChart — market metrics", () => {
  // Calendar-year filer, eight quarters, EPS 1 per quarter, 10 shares,
  // price rising 1 per day from 2023-01-01.
  const dates = quarterEnds(2023, 2024);
  const a = fin("A", {
    quarterly: dates.map((date) => ({ date, eps_diluted: 1, shares: 10, revenue: 100, fcf: 20, equity: 400, debt: 100, cash: 50 })),
  });
  const px = prices("2023-01-01", 800, (i) => 100 + i);
  const inputs = { financials: { A: a }, prices: { A: px } };

  it("P/E is price at period end over trailing four-quarter EPS", () => {
    const spec = createSpec({ granularity: "quarterly", series: [createSeries({ id: "pe", ticker: "A", metric: "pe_ttm", shape: "line" })] });
    const chart = resolveChart(spec, inputs);
    const v = col(chart, "pe");
    expect(v.slice(0, 3)).toEqual([null, null, null]); // no four quarters yet
    // 2023-12-31 is day 364 → close 464; EPS TTM = 4 → P/E 116.
    expect(v[3]).toBeCloseTo(464 / 4);
  });

  it("annual granularity uses the annual figure, not a rolling sum", () => {
    const ann = fin("A", { annual: [{ date: "2023-12-31", eps_diluted: 4, shares: 10 }] });
    const spec = createSpec({ granularity: "annual", series: [createSeries({ id: "pe", ticker: "A", metric: "pe_ttm", shape: "line" })] });
    const chart = resolveChart(spec, { financials: { A: ann }, prices: { A: px } });
    expect(col(chart, "pe")[0]).toBeCloseTo(464 / 4);
  });

  it("market cap and enterprise value use period-end price and balance", () => {
    const spec = createSpec({
      granularity: "quarterly",
      series: [createSeries({ id: "mc", ticker: "A", metric: "market_cap" }), createSeries({ id: "ev", ticker: "A", metric: "enterprise_value" })],
    });
    const chart = resolveChart(spec, inputs);
    // 2023-03-31 is day 89 → close 189 × 10 shares.
    expect(col(chart, "mc")[0]).toBe(1890);
    expect(col(chart, "ev")[0]).toBe(1890 + 100 - 50);
  });

  it("yields are percentages of market cap", () => {
    const spec = createSpec({ granularity: "quarterly", series: [createSeries({ id: "fy", ticker: "A", metric: "fcf_yield", shape: "line" })] });
    const chart = resolveChart(spec, inputs);
    // Q4 2023: FCF TTM 80, mcap 4640 → 1.724 %
    expect(col(chart, "fy")[3]).toBeCloseTo((80 / 4640) * 100);
  });

  it("is null and warns where the price history does not reach", () => {
    const spec = createSpec({ granularity: "quarterly", series: [createSeries({ id: "pe", ticker: "A", metric: "pe_ttm", shape: "line" })] });
    const chart = resolveChart(spec, { financials: { A: a }, prices: { A: prices("2030-01-01", 10, () => 1) } });
    expect(col(chart, "pe").every((v) => v === null)).toBe(true);
    expect(chart.warnings.some((w) => /price history covering/.test(w.message))).toBe(true);
  });
});

describe("resolveChart — time mode", () => {
  it("switches to a time axis when a price series is present and centres statement bars in their quarter", () => {
    const a = fin("A", { quarterly: [{ date: "2024-03-31", fcf: 20, shares: 10 }] });
    const px = prices("2024-01-01", 5, (i) => 10 + i);
    const spec = createSpec({
      granularity: "quarterly",
      series: [
        createSeries({ id: "f", ticker: "A", metric: "free_cash_flow", transform: "per_share", axis: "right" }),
        createSeries({ id: "p", ticker: "A", metric: "price", shape: "line" }),
      ],
    });
    const chart = resolveChart(spec, { financials: { A: a }, prices: { A: px } });
    expect(chart.xMode).toBe("time");
    expect(chart.xLabels).toEqual([]);
    expect(chart.points).toHaveLength(6); // 5 closes + 1 quarter midpoint
    const bar = chart.points.find((p) => p.f !== null)!;
    expect(bar.x).toBe(Date.UTC(2024, 1, 15));
    expect(bar.f).toBe(2);
    expect(bar.p).toBeNull();
    expect(chart.points[0]).toMatchObject({ x: Date.parse("2024-01-01"), p: 10, f: null });
    expect(chart.axes).toEqual({ left: "price", right: "per_share" });
  });

  it("indexes prices from the first close inside the range", () => {
    const px = prices("2024-01-01", 4, (i) => [50, 100, 150, 200][i]);
    const spec = createSpec({
      range: { from: "2024-01-02", to: null },
      series: [createSeries({ id: "p", ticker: "A", metric: "price", transform: "indexed", shape: "line" })],
    });
    const chart = resolveChart(spec, { financials: {}, prices: { A: px } });
    expect(col(chart, "p")).toEqual([0, 50, 100]);
  });
});
