import { describe, expect, it } from "vitest";
import { offHigh, sortGlance, volumeRatio, type GlanceFigures } from "../glance";

const none: GlanceFigures = { change: null, month: null, ytd: null, volume: null, earningsDays: null, gap: null, offHigh: null };
const row = (name: string, figures: Partial<GlanceFigures>) => ({ name, figures: { ...none, ...figures } });
const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const figuresOf = (r: { figures: GlanceFigures }) => r.figures;

describe("sortGlance", () => {
  const rows = [
    row("A", { change: 0.01, ytd: 0.3, earningsDays: 40, gap: 0.2 }),
    row("B", { change: -0.05, ytd: -0.1, earningsDays: 3, gap: -0.1 }),
    row("C", { change: 0.04, ytd: null, earningsDays: null, gap: null }),
    row("D", { change: null, ytd: 0.05, earningsDays: 12, gap: 0.02 }),
  ];

  it("puts today's gainers first, and the losers first the other way", () => {
    expect(names(sortGlance(rows, "day-up", figuresOf))).toEqual(["C", "A", "B", "D"]);
    expect(names(sortGlance(rows, "day-down", figuresOf))).toEqual(["B", "A", "C", "D"]);
  });

  it("orders the year so far both ways, leaving companies without it last", () => {
    expect(names(sortGlance(rows, "ytd-up", figuresOf))).toEqual(["A", "D", "B", "C"]);
    expect(names(sortGlance(rows, "ytd-down", figuresOf))).toEqual(["B", "D", "A", "C"]);
  });

  it("puts the soonest report first", () => {
    expect(names(sortGlance(rows, "earnings", figuresOf))).toEqual(["B", "D", "A", "C"]);
  });

  it("puts the company furthest below its buy price first", () => {
    expect(names(sortGlance(rows, "closest", figuresOf))).toEqual(["B", "D", "A", "C"]);
  });

  it("keeps the list's own order among equals and among the unknown", () => {
    const tied = [row("X", {}), row("Y", { volume: 2 }), row("Z", {}), row("W", { volume: 2 })];
    expect(names(sortGlance(tied, "volume", figuresOf))).toEqual(["Y", "W", "X", "Z"]);
  });
});

describe("volumeRatio", () => {
  it("is today's volume over the average, or nothing without both", () => {
    expect(volumeRatio(3_000, 1_000)).toBe(3);
    expect(volumeRatio(0, 1_000)).toBeNull();
    expect(volumeRatio(3_000, undefined)).toBeNull();
  });
});

describe("offHigh", () => {
  it("is how far the price sits below the high, never above it", () => {
    expect(offHigh(80, 100)).toBeCloseTo(-0.2);
    expect(offHigh(101, 100)).toBe(0);
    expect(offHigh(null, 100)).toBeNull();
    expect(offHigh(50, 0)).toBeNull();
  });
});
