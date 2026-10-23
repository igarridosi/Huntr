import { describe, expect, it } from "vitest";
import {
  biggestMover,
  buildMarketCards,
  buildStockCards,
  decodeEntities,
  extractDescription,
  involvedSymbols,
  isMarketStory,
  nameKeyword,
  pickNewsCandidates,
  type CompanyMove,
  type NewsCard,
  type NewsItem,
} from "../market-news";

const B = 1_000_000_000;
const company = (over: Partial<CompanyMove>): CompanyMove => ({
  ticker: "XYZ",
  name: "Xyz Corp",
  changePercent: 0,
  marketCap: 80 * B,
  volumeRatio: 1,
  ...over,
});

const symbolOf = (c: NewsCard) => (c.kind === "company" ? c.candidate.symbol : c.source);

describe("pickNewsCandidates", () => {
  it("takes a 5% move from a large company, and nothing under $50B", () => {
    const picked = pickNewsCandidates([
      company({ ticker: "BIG", changePercent: -0.07 }),
      company({ ticker: "SMALL", changePercent: 0.12, marketCap: 40 * B }),
      company({ ticker: "MILD", changePercent: 0.03 }),
    ]);
    expect(picked.map((c) => [c.symbol, c.reason])).toEqual([["BIG", "big-move"]]);
  });

  it("has a lower bar the larger the company, and for one in fashion", () => {
    const picked = pickNewsCandidates([
      company({ ticker: "LARGE", changePercent: 0.036, marketCap: 120 * B }),
      company({ ticker: "MEGA", changePercent: 0.021, marketCap: 3000 * B }),
      company({ ticker: "HOT", changePercent: -0.031, volumeRatio: 2.4 }),
      company({ ticker: "LUKEWARM", changePercent: -0.027, volumeRatio: 2.4 }),
      company({ ticker: "QUIET", changePercent: 0.018, marketCap: 3000 * B }),
    ]);
    expect(picked.map((c) => [c.symbol, c.reason]).sort()).toEqual([
      ["HOT", "trending"],
      ["LARGE", "large-cap"],
      ["MEGA", "mega-cap"],
    ]);
  });

  it("ranks a big move above a mega cap's small one", () => {
    const picked = pickNewsCandidates([
      company({ ticker: "LLY", changePercent: -0.02, marketCap: 900 * B }),
      company({ ticker: "PANW", changePercent: 0.062, marketCap: 130 * B }),
    ]);
    expect(picked.map((c) => c.symbol)).toEqual(["PANW", "LLY"]);
  });

  it("ranks the bigger company first for the same move", () => {
    const picked = pickNewsCandidates([
      company({ ticker: "MID", changePercent: 0.06, marketCap: 60 * B }),
      company({ ticker: "HUGE", changePercent: 0.06, marketCap: 2000 * B }),
    ]);
    expect(picked.map((c) => c.symbol)).toEqual(["HUGE", "MID"]);
  });

  it("asks for at most sixteen", () => {
    const many = Array.from({ length: 30 }, (_, i) => company({ ticker: `T${i}`, changePercent: 0.05 + i / 100 }));
    expect(pickNewsCandidates(many)).toHaveLength(16);
  });
});

describe("nameKeyword", () => {
  it("uses the first meaningful word", () => {
    expect(nameKeyword("Nvidia Corporation")).toBe("Nvidia");
    expect(nameKeyword("The Walt Disney Company")).toBe("Walt");
    expect(nameKeyword("Alphabet Inc. (Class A)")).toBe("Alphabet");
    expect(nameKeyword("GE")).toBeNull();
  });
});

const NOW = Date.parse("2026-10-23T16:00:00Z");
let seq = 0;
const item = (over: Partial<NewsItem>): NewsItem => ({
  id: `n${seq++}`,
  title: "",
  publisher: "Pub",
  link: "https://finance.yahoo.com/news/a",
  publishedAt: "2026-10-23T15:00:00Z",
  related: [],
  ...over,
});

describe("isMarketStory", () => {
  it("keeps market wraps and leaves stock picks and wire data out", () => {
    expect(isMarketStory(item({ title: "Stock market today: Dow, S&P 500 slip after tech sell-off" }))).toBe(true);
    expect(isMarketStory(item({ title: "U.S. Stock Futures Fall on AI Trade Concerns" }))).toBe(true);
    expect(isMarketStory(item({ title: "3 Nasdaq Stocks to Buy Now" }))).toBe(false);
    expect(isMarketStory(item({ title: "Is Kroger Stock Increasing Your Market Risk?" }))).toBe(false);
  });
});

describe("buildMarketCards", () => {
  const moves: Record<string, number> = { "GC=F": -0.012, "CL=F": 0.026, "^TNX": 0.008, "BTC-USD": -0.002 };
  const change = (s: string) => moves[s];

  it("leads with up to three market wraps, each shown once", () => {
    const wrap = item({ title: "Stock market today: Dow slips", related: ["^GSPC", "^DJI"], publishedAt: "2026-10-23T15:30:00Z" });
    const futures = item({ title: "Stock futures fall on AI concerns", related: ["^DJI"], publishedAt: "2026-10-23T13:00:00Z" });
    const close = item({ title: "Wall Street ends week higher", related: ["^IXIC"], publishedAt: "2026-10-23T09:00:00Z" });
    const fourth = item({ title: "Nasdaq rally fades", related: ["^IXIC"], publishedAt: "2026-10-23T08:00:00Z" });
    const cards = buildMarketCards({ "^GSPC": [wrap], "^DJI": [wrap, futures], "^IXIC": [close, fourth] }, NOW, change);
    expect(cards.map((c) => c.item.id)).toEqual([wrap.id, futures.id, close.id]);
  });

  it("then the assets, the one that moved most first, a story each before any gets a second", () => {
    const oil1 = item({ title: "Brent crude jumped 4% to $113", related: ["CL=F"], publishedAt: "2026-10-23T15:15:00Z" });
    const oil2 = item({ title: "Cruise stocks fall as oil hits a five-month high", related: ["CL=F"], publishedAt: "2026-10-23T15:00:00Z" });
    const gold = item({ title: "Gold slides back toward $4,000", related: ["GC=F"] });
    const rates = item({ title: "10-year Treasury yield holds below 5%", related: ["^TNX"] });
    const cards = buildMarketCards({ "CL=F": [oil1, oil2], "GC=F": [gold], "^TNX": [rates] }, NOW, change);
    expect(cards.map((c) => (c.kind === "market" ? c.topic : ""))).toEqual(["oil", "gold", "rates", "oil"]);
  });

  it("keeps an asset's stories to the ones about it, and drops wire data", () => {
    const cards = buildMarketCards(
      {
        "GC=F": [
          item({ title: "BC-Gold Futures", related: ["GC=F"] }),
          item({ title: "Slam Exploration to start drilling at Moose Lake", related: ["GC=F"] }),
        ],
        "CL=F": [item({ title: "Global Line Pipe Market: Size, Share, Forecast to 2031", related: ["CL=F"] })],
      },
      NOW,
      change
    );
    expect(cards).toEqual([]);
  });

  it("drops a wrap from the day before", () => {
    const cards = buildMarketCards(
      { "^GSPC": [item({ title: "Stock market today: stocks rally", related: ["^GSPC"], publishedAt: "2026-10-22T10:00:00Z" })] },
      NOW,
      change
    );
    expect(cards).toEqual([]);
  });
});

describe("buildStockCards", () => {
  it("one card per company whose headline names it, in rank order", () => {
    const candidates = pickNewsCandidates([
      company({ ticker: "NVDA", name: "Nvidia Corporation", changePercent: -0.06, marketCap: 5000 * B }),
      company({ ticker: "AXP", name: "American Express", changePercent: -0.05, marketCap: 200 * B }),
      company({ ticker: "STLA", name: "Stellantis", changePercent: -0.075, marketCap: 60 * B }),
    ]);
    const cards = buildStockCards(candidates, {
      NVDA: [
        item({ title: "Stock market today: Dow slips", related: ["^DJI", "NVDA"], publishedAt: "2026-10-23T15:50:00Z" }),
        item({ title: "Nvidia falls as chip export rules tighten", related: ["NVDA"] }),
      ],
      AXP: [item({ title: "American Express announces layoffs", related: ["AXP"] })],
      STLA: [item({ title: "Stellantis sinks 8% ahead of Q3", related: ["STLA"] })],
    }, NOW);
    expect(cards.map(symbolOf)).toEqual(["NVDA", "STLA", "AXP"]);
  });

  it("passes over a headline reporting the move the other way", () => {
    const candidates = pickNewsCandidates([company({ ticker: "AMD", name: "Advanced Micro Devices", changePercent: 0.021, marketCap: 400 * B })]);
    const stale = item({ title: "AMD Slides 8% as Tech Selloff Deepens", related: ["AMD"], publishedAt: "2026-10-23T12:00:00Z" });
    const today = item({ title: "AMD rebounds with chip stocks", related: ["AMD"], publishedAt: "2026-10-23T11:00:00Z" });
    expect(buildStockCards(candidates, { AMD: [stale] }, NOW)).toEqual([]);
    expect(buildStockCards(candidates, { AMD: [stale, today] }, NOW).map((c) => c.item.id)).toEqual([today.id]);
  });

  it("passes over teasers and comparisons that only name the company", () => {
    const candidates = pickNewsCandidates([company({ ticker: "MU", name: "Micron Technology", changePercent: 0.06, marketCap: 150 * B })]);
    const cards = buildStockCards(candidates, {
      MU: [
        item({ title: "Not Nvidia. Not Micron. This Little-Known Chip Stock Is a Secret.", related: ["MU"] }),
        item({ title: "Micron vs. SK Hynix: Which Stock Has the Edge?", related: ["MU"] }),
      ],
    }, NOW);
    expect(cards).toEqual([]);
  });

  it("prefers the story that reports the move over a newer one that does not", () => {
    const candidates = pickNewsCandidates([company({ ticker: "MU", name: "Micron Technology", changePercent: 0.06, marketCap: 150 * B })]);
    const report = item({ title: "Micron jumps 6% on memory pricing", related: ["MU"], publishedAt: "2026-10-23T12:00:00Z" });
    const cards = buildStockCards(candidates, {
      MU: [item({ title: "Micron names a new CFO", related: ["MU"], publishedAt: "2026-10-23T15:00:00Z" }), report],
    }, NOW);
    expect(cards.map((c) => c.item.id)).toEqual([report.id]);
  });

  it("skips a story the Markets row already shows", () => {
    const candidates = pickNewsCandidates([company({ ticker: "XOM", name: "ExxonMobil", changePercent: 0.03, marketCap: 500 * B })]);
    const shared = item({ title: "ExxonMobil climbs as oil jumps 4%", related: ["XOM", "CL=F"] });
    const used = new Set<string>();
    buildMarketCards({ "CL=F": [shared] }, NOW, () => 0.02, used);
    expect(buildStockCards(candidates, { XOM: [shared] }, NOW, used)).toEqual([]);
  });

  it("does not match a ticker inside another word", () => {
    const ge = pickNewsCandidates([company({ ticker: "GE", name: "GE", changePercent: 0.08, marketCap: 250 * B })]);
    expect(buildStockCards(ge, { GE: [item({ title: "Gene therapy stocks surge", related: ["GE"] })] }, NOW)).toEqual([]);
  });
});

describe("biggestMover", () => {
  it("picks the tagged index that moved most", () => {
    const story = item({ related: ["^GSPC", "^DJI"] });
    const moves: Record<string, number> = { "^GSPC": -0.001, "^IXIC": 0.02, "^DJI": -0.011 };
    expect(biggestMover(story, ["^GSPC", "^IXIC", "^DJI"], (s) => moves[s])).toBe("^DJI");
    expect(biggestMover(item({ related: [] }), ["^GSPC"], (s) => moves[s])).toBeNull();
  });
});

describe("involvedSymbols", () => {
  it("keeps the symbols the page knows, in order, up to the limit", () => {
    const story = item({ related: ["NQ=F", "NVDA", "^GSPC", "BZ=F", "AMD", "TSLA"] });
    const known = new Set(["NVDA", "^GSPC", "AMD", "TSLA"]);
    expect(involvedSymbols(story, (s) => known.has(s), 3)).toEqual(["NVDA", "^GSPC", "AMD"]);
  });
});

describe("extractDescription", () => {
  it("reads og:description, whatever the attribute order, and decodes it", () => {
    const html = `<head><meta name="description" content="Fallback text that is long enough to be shown here."><meta content="Stocks were headed lower on Friday to cap a volatile week &#x27;for tech&#x27; &amp; energy." property="og:description"></head>`;
    expect(extractDescription(html)).toBe("Stocks were headed lower on Friday to cap a volatile week 'for tech' & energy.");
  });

  it("falls back to description, and says nothing when there is nothing worth showing", () => {
    expect(extractDescription(`<meta name="description" content="A plain description that is long enough to show.">`)).toBe(
      "A plain description that is long enough to show."
    );
    expect(extractDescription(`<meta property="og:description" content="Too short">`)).toBeNull();
    expect(extractDescription("<p>no meta</p>")).toBeNull();
  });

  it("shortens a long one at a sentence when it can", () => {
    const long = `${"First sentence goes on for a while. ".repeat(6)}Then more words that run past the limit.`;
    const out = extractDescription(`<meta property="og:description" content="${long}">`, 120);
    expect(out!.length).toBeLessThanOrEqual(120);
    expect(out!.endsWith(".")).toBe(true);
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric entities and leaves unknown ones", () => {
    expect(decodeEntities("AT&amp;T &#8217;s &#x2014; &bogus;")).toBe("AT&T ’s — &bogus;");
  });
});
