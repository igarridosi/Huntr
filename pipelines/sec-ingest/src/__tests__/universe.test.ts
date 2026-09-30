import { describe, expect, it } from "vitest";
import { buildUniverse } from "../universe";

const secTickers = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 1652044, ticker: "GOOGL", title: "Alphabet Inc." },
  "2": { cik_str: 1652044, ticker: "GOOG", title: "Alphabet Inc." },
  "3": { cik_str: 1067983, ticker: "BRK-B", title: "Berkshire Hathaway" },
};

describe("buildUniverse", () => {
  it("resolves tickers to CIKs and downloads a company once, whatever its tickers", () => {
    const u = buildUniverse(["googl", "GOOG", "AAPL", "AAPL", " BRK-B "], secTickers);
    expect(u.companies).toEqual([
      { cik: 320193, ticker: "AAPL", tickers: ["AAPL"] },
      { cik: 1067983, ticker: "BRK-B", tickers: ["BRK-B"] },
      { cik: 1652044, ticker: "GOOG", tickers: ["GOOG", "GOOGL"] },
    ]);
    expect(u.unresolved).toEqual([]);
  });

  it("lists what EDGAR does not know instead of failing", () => {
    expect(buildUniverse(["HLN.L", "SPY", "AAPL"], secTickers).unresolved).toEqual(["HLN.L", "SPY"]);
  });
});
