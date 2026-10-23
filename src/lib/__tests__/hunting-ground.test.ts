import { describe, expect, it } from "vitest";
import { buildHuntingGround, companyKey, placeCard, rankZone, yPosition, zoneOf, type HgCompany } from "../hunting-ground";

const B = 1_000_000_000;
const company = (ticker: string, over: Partial<HgCompany> = {}): HgCompany => ({
  ticker,
  name: ticker,
  sector: "Technology",
  marketCap: 100 * B,
  change: 0,
  ...over,
});

describe("zoneOf", () => {
  it("splits at a quality of 60 and a 4% yield", () => {
    expect(zoneOf(87, 0.091)).toBe("prime");
    expect(zoneOf(93, 0.008)).toBe("paying-up");
    expect(zoneOf(47, 0.074)).toBe("trap");
    expect(zoneOf(22, 0.01)).toBe("avoid");
    expect(zoneOf(60, 0.04)).toBe("prime");
  });
});

describe("yPosition", () => {
  it("runs bottom to top, clamped, and spreads the common 0-4% band", () => {
    expect(yPosition(-0.5)).toBe(0);
    expect(yPosition(0.5)).toBe(1);
    expect(yPosition(0.01)).toBeLessThan(yPosition(0.04));
    // On a straight scale 0-4% would be a third of the height; here it is more.
    expect(yPosition(0.04) - yPosition(0)).toBeGreaterThan(0.4);
  });
});

describe("buildHuntingGround", () => {
  it("takes the largest companies, leaves out financials and the unscored, and says how many", () => {
    const ground = buildHuntingGround(
      [
        company("ADBE"),
        company("JPM", { sector: "Financial Services" }),
        company("O", { sector: "Real Estate" }),
        company("NOQ"),
        company("TINY", { marketCap: 5 * B }),
      ],
      {
        ADBE: { quality: 87, fcfYield: 0.091 },
        JPM: { quality: 33, fcfYield: null },
        NOQ: { quality: null, fcfYield: 0.03 },
        TINY: { quality: 90, fcfYield: 0.1 },
      }
    );
    expect(ground.points.map((p) => [p.ticker, p.zone])).toEqual([["ADBE", "prime"]]);
    expect(ground.financials).toBe(2);
    expect(ground.unscored).toBe(1);
  });
});

describe("rankZone", () => {
  it("puts the company furthest into the zone's corner first", () => {
    const { points } = buildHuntingGround(
      [company("A"), company("B"), company("C"), company("D")],
      {
        A: { quality: 70, fcfYield: 0.05 },
        B: { quality: 90, fcfYield: 0.09 },
        C: { quality: 30, fcfYield: 0.0 },
        D: { quality: 50, fcfYield: 0.02 },
      }
    );
    expect(rankZone(points, "prime").map((p) => p.ticker)).toEqual(["B", "A"]);
    expect(rankZone(points, "avoid").map((p) => p.ticker)).toEqual(["C", "D"]);
  });
});

describe("share classes", () => {
  it("reads two classes of one company as one", () => {
    expect(companyKey("Alphabet Inc. (Class A)")).toBe(companyKey("Alphabet Inc. (Class C)"));
    expect(companyKey("Fox Corporation - Class A Common Stock")).toBe(companyKey("Fox Corporation - Class B Common Stock"));
    expect(companyKey("Fox Corporation")).not.toBe(companyKey("Fox Factory Holding Corp."));
  });

  it("keeps the larger class and names the other on it", () => {
    const { points } = buildHuntingGround(
      [
        company("GOOG", { name: "Alphabet Inc. (Class C)", marketCap: 1900 * B }),
        company("GOOGL", { name: "Alphabet Inc. (Class A)", marketCap: 2000 * B }),
      ],
      { GOOG: { quality: 81, fcfYield: 0.0058 }, GOOGL: { quality: 81, fcfYield: 0.0057 } }
    );
    expect(points.map((p) => [p.ticker, p.otherClasses])).toEqual([["GOOGL", ["GOOG"]]]);
  });
});

describe("placeCard", () => {
  const card = { width: 264, height: 300 };
  const bounds = { width: 800, height: 500 };

  it("sits to the right of the bubble, a gap from its edge, centred on its height", () => {
    expect(placeCard({ x: 200, y: 250, r: 10 }, card, bounds)).toEqual({ left: 224, top: 100 });
  });

  it("goes to the left when the right has no room, never covering the bubble", () => {
    const { left } = placeCard({ x: 700, y: 250, r: 20 }, card, bounds);
    expect(left + card.width).toBeLessThanOrEqual(700 - 20);
  });

  it("stays inside the chart near the top and bottom", () => {
    expect(placeCard({ x: 200, y: 10, r: 8 }, card, bounds).top).toBe(6);
    expect(placeCard({ x: 200, y: 495, r: 8 }, card, bounds).top).toBe(500 - 6 - 300);
  });
});
