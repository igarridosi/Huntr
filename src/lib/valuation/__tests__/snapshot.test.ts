import { describe, expect, it } from "vitest";
import { cagrOf, impliedFcfGrowth, positionIn, priceOn, spreadOf } from "../snapshot";

describe("priceOn", () => {
  const history = [
    { date: "2025-01-24", close: 100 },
    { date: "2025-01-27", close: 102 },
    { date: "2025-01-31", close: 105 },
  ];

  it("takes the last close on or before the date", () => {
    expect(priceOn(history, "2025-01-29")).toBe(102);
    expect(priceOn(history, "2025-01-31")).toBe(105);
  });

  it("gives up when the nearest close is too far back", () => {
    expect(priceOn(history, "2025-03-31")).toBeNull();
    expect(priceOn(history, "2025-01-01")).toBeNull();
  });
});

describe("spreadOf / positionIn", () => {
  it("finds min, median and max, ignoring non-finite values", () => {
    expect(spreadOf([30, 10, NaN, 20, 40])).toEqual({ min: 10, median: 25, max: 40, count: 4 });
    expect(spreadOf([])).toBeNull();
  });

  it("places a value within the spread, clamped", () => {
    const s = { min: 10, median: 20, max: 30, count: 3 };
    expect(positionIn(s, 20)).toBe(0.5);
    expect(positionIn(s, 50)).toBe(1);
    expect(positionIn(s, 0)).toBe(0);
  });
});

describe("impliedFcfGrowth", () => {
  it("recovers the growth that produced the value", () => {
    // Build an EV from a known 12% growth, then solve back for it.
    const fcf = 100;
    const r = 0.09;
    const tg = 0.03;
    let total = 0;
    let flow = fcf;
    for (let t = 1; t <= 10; t++) {
      flow *= 1.12;
      total += flow / (1 + r) ** t;
    }
    const ev = total + (flow * (1 + tg)) / (r - tg) / (1 + r) ** 10;
    expect(impliedFcfGrowth({ fcf, enterpriseValue: ev })).toBeCloseTo(0.12, 4);
  });

  it("is null without positive free cash flow or out of reach", () => {
    expect(impliedFcfGrowth({ fcf: -5, enterpriseValue: 1000 })).toBeNull();
    expect(impliedFcfGrowth({ fcf: 1, enterpriseValue: 1e12 })).toBeNull();
  });
});

describe("cagrOf", () => {
  it("compounds from the first value to the last", () => {
    expect(cagrOf([100, 110, 121])).toBeCloseTo(0.1, 10);
  });

  it("is null when an end is not positive", () => {
    expect(cagrOf([-1, 10])).toBeNull();
    expect(cagrOf([5])).toBeNull();
  });
});
