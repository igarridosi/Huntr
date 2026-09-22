import { describe, expect, it } from "vitest";
import { isCountedPath, normalizePath, parseEvent } from "../events";

describe("normalizePath", () => {
  it("keeps the path and drops everything that could carry personal data", () => {
    expect(normalizePath("/symbol/QCOM")).toBe("/symbol/QCOM");
    expect(normalizePath("https://huntrvalue.me/app/screener")).toBe("/app/screener");
    expect(normalizePath("/app/chart-builder?c=eyJ0aXRsZSI6IkFwcGxlIn0%3D")).toBe("/app/chart-builder");
    expect(normalizePath("/auth/callback#access_token=secret")).toBe("/auth/callback");
    expect(normalizePath("/app/watchlists/")).toBe("/app/watchlists");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("javascript:alert(1)")).toBeNull();
  });
});

describe("parseEvent", () => {
  it("stores a known event with a path and a ticker", () => {
    expect(parseEvent({ event: "page_view", path: "/symbol/aapl?x=1", ticker: "aapl" })).toEqual({
      event: "page_view",
      path: "/symbol/aapl",
      ticker: "AAPL",
      props: null,
    });
  });

  it("refuses an unknown event, a malformed payload and a page view without a path", () => {
    expect(parseEvent({ event: "steal_everything", path: "/" })).toBeNull();
    expect(parseEvent({ event: "page_view" })).toBeNull();
    expect(parseEvent("page_view")).toBeNull();
    expect(parseEvent(null)).toBeNull();
  });

  it("drops a ticker that is not one", () => {
    expect(parseEvent({ event: "valuation_run", ticker: "'; DROP TABLE --" })?.ticker).toBeNull();
    expect(parseEvent({ event: "valuation_run", ticker: "BRK.B" })?.ticker).toBe("BRK.B");
  });

  it("keeps props small, flat and scalar", () => {
    const row = parseEvent({
      event: "valuation_blocked",
      props: {
        reasons: ["market cap", "total debt"],
        count: 2,
        blocked: true,
        long: "x".repeat(400),
        nested: { secret: 1 },
        empty: "",
      },
    });
    expect(row?.props).toEqual({
      reasons: ["market cap", "total debt"],
      count: 2,
      blocked: true,
      long: "x".repeat(120),
    });
  });

  it("returns no props rather than an empty object", () => {
    expect(parseEvent({ event: "chart_saved", props: { nested: {} } })?.props).toBeNull();
  });
});

describe("isCountedPath", () => {
  it("leaves my own dashboard out of the numbers", () => {
    expect(isCountedPath("/app/admin/analytics")).toBe(false);
    expect(isCountedPath("/app/admin")).toBe(false);
    expect(isCountedPath("/app/administrator-notes")).toBe(true);
    expect(isCountedPath("/symbol/QCOM")).toBe(true);
  });
});
