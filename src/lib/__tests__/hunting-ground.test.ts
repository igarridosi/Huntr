import { describe, expect, it } from "vitest";
import { buildHuntingGround, companyKey, isUnmeasured, placeCard, rankZone, separate, yPosition, zoneOf, type HgCompany } from "../hunting-ground";

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
  it("takes the largest companies, leaves out lenders and the unscored, and says how many", () => {
    const ground = buildHuntingGround(
      [
        company("ADBE"),
        company("JPM", { sector: "Financials" }),
        company("O", { sector: "Real Estate" }),
        company("V", { sector: "Financials" }),
        company("NOQ"),
        company("NOY"),
        company("TINY", { marketCap: 5 * B }),
      ],
      {
        ADBE: { quality: 87, fcfYield: 0.091 },
        JPM: { quality: 33, fcfYield: null, industry: "Banks - Diversified" },
        O: { quality: 50, fcfYield: 0.05, industry: "REIT - Retail" },
        V: { quality: 84, fcfYield: 0.027, industry: "Credit Services" },
        NOQ: { quality: null, fcfYield: 0.03 },
        NOY: { quality: 70, fcfYield: null },
        TINY: { quality: 90, fcfYield: 0.1 },
      }
    );
    expect(ground.points.map((p) => [p.ticker, p.zone])).toEqual([
      ["ADBE", "prime"],
      ["V", "paying-up"],
    ]);
    expect(ground).toMatchObject({ considered: 6, financials: 2, noQuality: 1, noYield: 1, merged: 0 });
  });

  it("leaves a financial company out when its industry is unknown", () => {
    expect(isUnmeasured("Financials", null)).toBe(true);
    expect(isUnmeasured("Financials", "Financial Data & Stock Exchanges")).toBe(false);
    expect(isUnmeasured("Real Estate", "Real Estate Services")).toBe(false);
    expect(isUnmeasured("Real Estate", "Real Estate - Development")).toBe(true);
    expect(isUnmeasured("Financials", "Insurance - Property & Casualty")).toBe(true);
    expect(isUnmeasured("Industrials", null)).toBe(false);
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

describe("separate", () => {
  const bounds = { left: 0, top: 0, right: 500, bottom: 500 };
  const overlap = (a: { x: number; y: number }, b: { x: number; y: number }, ra: number, rb: number) => Math.hypot(a.x - b.x, a.y - b.y) < ra + rb;

  it("pushes apart two bubbles on the same spot", () => {
    const out = separate([{ id: "A", x: 250, y: 250, r: 20 }, { id: "B", x: 250, y: 250, r: 12 }], bounds);
    expect(overlap(out.get("A")!, out.get("B")!, 20, 12)).toBe(false);
  });

  it("moves the smaller one more, and leaves bubbles that do not touch where they are", () => {
    const out = separate(
      [
        { id: "BIG", x: 200, y: 200, r: 30 },
        { id: "SMALL", x: 220, y: 200, r: 8 },
        { id: "AWAY", x: 400, y: 400, r: 10 },
      ],
      bounds
    );
    const big = out.get("BIG")!;
    const small = out.get("SMALL")!;
    expect(Math.hypot(small.x - 220, small.y - 200)).toBeGreaterThan(Math.hypot(big.x - 200, big.y - 200));
    expect(out.get("AWAY")).toEqual({ x: 400, y: 400 });
  });

  it("clears a crowd and keeps it in the frame", () => {
    const crowd = Array.from({ length: 12 }, (_, i) => ({ id: `C${i}`, x: 250 + (i % 3), y: 250 + (i % 4), r: 14 }));
    const out = separate(crowd, bounds);
    for (let i = 0; i < crowd.length; i++)
      for (let j = i + 1; j < crowd.length; j++) expect(overlap(out.get(crowd[i].id)!, out.get(crowd[j].id)!, 13.9, 13.9)).toBe(false);
    for (const p of out.values()) expect(p.x >= 14 && p.x <= 486 && p.y >= 14 && p.y <= 486).toBe(true);
  });
});
