import { describe, expect, it } from "vitest";
import { buildUniverse } from "../universe";

// In EDGAR's order: within a CIK, the main listing first.
const secTickers = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 1652044, ticker: "GOOGL", title: "Alphabet Inc." },
  "2": { cik_str: 1067983, ticker: "BRK-B", title: "Berkshire Hathaway" },
  "3": { cik_str: 1166691, ticker: "CMCSA", title: "Comcast Corp" },
  "4": { cik_str: 732717, ticker: "T", title: "AT&T Inc." },
  "5": { cik_str: 1652044, ticker: "GOOG", title: "Alphabet Inc." },
  "6": { cik_str: 1067983, ticker: "BRK-A", title: "Berkshire Hathaway" },
  "7": { cik_str: 1166691, ticker: "CCZ", title: "Comcast Corp" },
  "8": { cik_str: 732717, ticker: "TBB", title: "AT&T Inc." },
};

describe("buildUniverse", () => {
  it("resolves tickers to CIKs and downloads a company once, whatever its tickers", () => {
    const u = buildUniverse(["googl", "GOOG", "AAPL", "AAPL", " BRK-B "], secTickers);
    expect(u.companies).toEqual([
      { cik: 320193, ticker: "AAPL", tickers: ["AAPL"] },
      { cik: 1067983, ticker: "BRK-B", tickers: ["BRK-B"] },
      { cik: 1652044, ticker: "GOOGL", tickers: ["GOOG", "GOOGL"] },
    ]);
    expect(u.unresolved).toEqual([]);
  });

  it("names a company by the ticker EDGAR lists first, not the first alphabetically", () => {
    const u = buildUniverse(["CCZ", "CMCSA", "TBB", "T"], secTickers);
    expect(u.companies).toEqual([
      { cik: 732717, ticker: "T", tickers: ["T", "TBB"] },
      { cik: 1166691, ticker: "CMCSA", tickers: ["CCZ", "CMCSA"] },
    ]);
  });

  it("still loads a company the app only knows by a secondary ticker", () => {
    expect(buildUniverse(["TBB"], secTickers).companies).toEqual([{ cik: 732717, ticker: "TBB", tickers: ["TBB"] }]);
  });

  it("finds a share class written with a dot or a slash under EDGAR's hyphen, keeping the app's spelling", () => {
    const u = buildUniverse(["BRK.B", "brk/a"], secTickers);
    expect(u.companies).toEqual([{ cik: 1067983, ticker: "BRK.B", tickers: ["BRK.B", "BRK/A"] }]);
    expect(u.unresolved).toEqual([]);
  });

  it("lists what EDGAR does not know instead of failing", () => {
    expect(buildUniverse(["HLN.L", "SPY", "AAPL"], secTickers).unresolved).toEqual(["HLN.L", "SPY"]);
  });
});
