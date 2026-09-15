import { describe, expect, it } from "vitest";
import { METRICS, METRIC_GROUPS, METRIC_IDS, isMetricId, metricsInGroup } from "../metrics";
import {
  CHART_SPEC_VERSION,
  DEFAULT_STYLE,
  MAX_SERIES,
  createSeries,
  createSpec,
  hasErrors,
  migrateSpec,
  normalizeSpec,
  validateSpec,
} from "../spec";
import { TEMPLATES } from "../templates";
import { CANVAS_THEMES, SERIES_PALETTE, paletteColor, seriesInk } from "../themes";
import { decodeSpec, encodeSpec } from "../url";

const codes = (spec: ReturnType<typeof createSpec>) => validateSpec(spec).map((i) => i.code);

describe("metric catalogue", () => {
  it("every id resolves, has a group from the list and a reader or deriver matching its source", () => {
    for (const id of METRIC_IDS) {
      const d = METRICS[id];
      expect(d.id).toBe(id);
      expect(METRIC_GROUPS).toContain(d.group);
      if (d.source === "statements") expect(typeof d.read).toBe("function");
      if (d.source === "market") expect(typeof d.derive).toBe("function");
      if (d.source === "price") expect(d.read ?? d.derive).toBeUndefined();
    }
  });

  it("covers the figures the request called out", () => {
    for (const id of ["capex", "long_term_debt", "net_debt", "pe_ttm", "market_cap", "enterprise_value", "fcf_yield", "ev_to_ebitda"]) {
      expect(isMetricId(id)).toBe(true);
    }
    expect(isMetricId("pe_forward")).toBe(false); // no consensus history in the data layer
  });

  it("groups every metric exactly once", () => {
    const total = METRIC_GROUPS.reduce((n, g) => n + metricsInGroup(g).length, 0);
    expect(total).toBe(METRIC_IDS.length);
  });
});

describe("validateSpec", () => {
  it("passes a well-formed spec", () => {
    const spec = createSpec({ series: [createSeries({ ticker: "AAPL", metric: "revenue" })] });
    expect(validateSpec(spec)).toEqual([]);
  });

  it("caps series and tickers", () => {
    const many = createSpec({
      series: Array.from({ length: MAX_SERIES + 1 }, (_, i) => createSeries({ ticker: `T${i}`, metric: "revenue" })),
    });
    expect(codes(many)).toEqual(expect.arrayContaining(["too_many_series", "too_many_tickers"]));
    expect(hasErrors(validateSpec(many))).toBe(true);
  });

  it("flags ttm outside quarterly flow metrics as warnings", () => {
    const annualTtm = createSpec({ granularity: "annual", series: [createSeries({ ticker: "A", metric: "revenue", transform: "ttm" })] });
    expect(codes(annualTtm)).toEqual(["ttm_needs_quarterly"]);
    const stockTtm = createSpec({ granularity: "quarterly", series: [createSeries({ ticker: "A", metric: "long_term_debt", transform: "ttm" })] });
    expect(codes(stockTtm)).toEqual(["ttm_needs_flow"]);
    expect(hasErrors(validateSpec(stockTtm))).toBe(false);
  });

  it("rejects per_share on prices, ratios and market metrics", () => {
    for (const metric of ["price", "gross_margin", "pe_ttm"] as const) {
      const spec = createSpec({ series: [createSeries({ ticker: "A", metric, transform: "per_share" })] });
      expect(codes(spec)).toEqual(["per_share_needs_currency"]);
    }
  });

  it("wants indexed series drawn as lines", () => {
    const spec = createSpec({ series: [createSeries({ ticker: "A", metric: "price", transform: "indexed", shape: "bar" })] });
    expect(codes(spec)).toEqual(["indexed_needs_line"]);
  });

  it("checks tickers, ids and ranges", () => {
    const spec = createSpec({
      range: { from: "2024-12-31", to: "2024-01-01" },
      series: [createSeries({ id: "x", ticker: "not a ticker", metric: "revenue" }), createSeries({ id: "x", ticker: "AAPL", metric: "revenue" })],
    });
    expect(codes(spec)).toEqual(expect.arrayContaining(["bad_ticker", "duplicate_series_id", "range_inverted"]));
    expect(codes(createSpec({ range: { from: "yesterday", to: null } }))).toEqual(["bad_range"]);
  });
});

describe("normalizeSpec", () => {
  it("applies the coercions the warnings describe", () => {
    const spec = createSpec({
      granularity: "annual",
      series: [
        createSeries({ ticker: " aapl ", metric: "revenue", transform: "ttm" }),
        createSeries({ ticker: "MSFT", metric: "price", transform: "indexed", shape: "bar" }),
        createSeries({ ticker: "MSFT", metric: "pe_ttm", transform: "per_share" }),
      ],
    });
    const n = normalizeSpec(spec);
    expect(n.series[0]).toMatchObject({ ticker: "AAPL", transform: "raw" });
    expect(n.series[1]).toMatchObject({ transform: "indexed", shape: "line" });
    expect(n.series[2]).toMatchObject({ transform: "raw" });
    expect(validateSpec(n)).toEqual([]);
  });

  it("drops unknown metrics instead of failing", () => {
    const spec = createSpec({ series: [{ ...createSeries({ ticker: "A", metric: "revenue" }), metric: "nope" as never }] });
    expect(normalizeSpec(spec).series).toEqual([]);
  });
});

describe("migrateSpec", () => {
  it("round-trips a current spec unchanged", () => {
    const spec = createSpec({ title: "T", subtitle: "S", series: [createSeries({ id: "a", ticker: "A", metric: "revenue", hidden: true })] });
    const r = migrateSpec(JSON.parse(JSON.stringify(spec)));
    expect(r).toEqual({ ok: true, spec, migratedFrom: null });
  });

  it("fills missing style fields and drops unknown ones", () => {
    const r = migrateSpec({ v: 1, title: "T", series: [], style: { theme: "snow", bogus: 1, barRadius: 7 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.style).toEqual({ ...DEFAULT_STYLE, theme: "snow" });
      expect("bogus" in r.spec.style).toBe(false);
    }
  });

  it("defaults align to common and keeps an explicit all", () => {
    const r = migrateSpec({ v: 1, title: "T", series: [] });
    expect(r.ok && r.spec.align).toBe("common");
    const r2 = migrateSpec({ v: 1, title: "T", series: [], align: "all" });
    expect(r2.ok && r2.spec.align).toBe("all");
  });

  it("lifts a version-less object and reports where it came from", () => {
    const r = migrateSpec({ title: "old", series: [{ ticker: "aapl", metric: "revenue" }] });
    expect(r.ok && r.migratedFrom).toBe(0);
    expect(r.ok && r.spec.v).toBe(CHART_SPEC_VERSION);
    expect(r.ok && r.spec.series[0]).toMatchObject({ ticker: "AAPL", transform: "raw", shape: "bar", axis: "left" });
  });

  it("refuses specs from a newer version and malformed input", () => {
    expect(migrateSpec({ v: CHART_SPEC_VERSION + 1, title: "x", series: [] })).toEqual({ ok: false, reason: "newer_version" });
    expect(migrateSpec("nope")).toEqual({ ok: false, reason: "malformed" });
    expect(migrateSpec({ v: 1, title: "x", series: [{ ticker: 1 }] })).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("url", () => {
  it("encodes to a URL-safe string and decodes to an equal spec", () => {
    const spec = createSpec({ title: "Ingresos — Alphabet · «test» ñ", series: [createSeries({ id: "a", ticker: "GOOGL", metric: "revenue" })] });
    const enc = encodeSpec(spec);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSpec(enc)).toEqual(spec);
  });

  it("stays small enough for a query string", () => {
    const spec = TEMPLATES.find((t) => t.id === "revenue-race")!.build(["GOOGL", "AMZN", "META", "MSFT"]);
    expect(encodeSpec(spec).length).toBeLessThan(1500);
  });

  it("returns null for garbage, empty and foreign JSON", () => {
    expect(decodeSpec("")).toBeNull();
    expect(decodeSpec(null)).toBeNull();
    expect(decodeSpec("!!!not base64!!!")).toBeNull();
    expect(decodeSpec(btoa("[1,2,3]"))).toBeNull();
  });

  it("normalises what it decodes", () => {
    const spec = createSpec({ granularity: "annual", series: [createSeries({ id: "a", ticker: "A", metric: "revenue", transform: "ttm" })] });
    expect(decodeSpec(encodeSpec(spec))?.series[0].transform).toBe("raw");
  });
});

describe("templates", () => {
  it("every template builds a valid spec with fallback tickers", () => {
    for (const t of TEMPLATES) {
      const spec = t.build([]);
      expect(validateSpec(spec)).toEqual([]);
      expect(spec.series.length).toBeGreaterThan(0);
      expect(new Set(spec.series.map((s) => s.ticker)).size).toBe(t.tickers);
    }
  });

  it("uses the tickers it is given, in order", () => {
    const spec = TEMPLATES.find((t) => t.id === "revenue-race")!.build(["NVDA", "AMD"]);
    expect(spec.series.map((s) => s.ticker)).toEqual(["NVDA", "AMD", "AAPL", "MSFT"]);
  });

  it("keeps line and area as distinct shapes", () => {
    const shapes = new Set(TEMPLATES.flatMap((t) => t.build([]).series.map((s) => s.shape)));
    expect(shapes.has("line")).toBe(true);
    expect(shapes.has("area")).toBe(true);
    expect("areaFill" in DEFAULT_STYLE).toBe(false);
  });
});

describe("themes", () => {
  it("the palette wraps by index", () => {
    expect(paletteColor(0)).toBe(SERIES_PALETTE[0]);
    expect(paletteColor(SERIES_PALETTE.length)).toBe(SERIES_PALETTE[0]);
  });

  it("light canvases swap the pale entries for darker ink and dark ones do not", () => {
    expect(seriesInk("#FFBF69", "wolf")).toBe("#FFBF69");
    expect(seriesInk("#ffbf69", "parchment")).not.toBe("#FFBF69");
    expect(seriesInk("#FF8C42", "snow")).toBe("#FF8C42");
    for (const t of Object.values(CANVAS_THEMES)) expect(t.bg).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
