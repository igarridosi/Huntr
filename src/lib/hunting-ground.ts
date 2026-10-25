/**
 * The Hunting Ground: the largest companies placed by how good they are and
 * how much they cost, so the question a value investor asks ("what is good
 * and cheap?") is answered by where a company sits.
 *
 *   across  Huntr's quality score, 0-100 (profitability, financial health,
 *           growth, cash generation; weekly, from the filings).
 *   up      Free-cash-flow yield: the cash the business generated over the
 *           last year against what the market charges for it. 5% means
 *           paying 20 times that cash; 1% means 100 times.
 *
 * Four zones, split at a quality of 60 and a yield of 4% (25 times cash):
 *
 *   prime      quality, priced cheap: where to hunt
 *   paying-up  quality, priced as such
 *   trap       cheap, for a reason
 *   avoid      weak and expensive
 *
 * Left out, and said so: banks, insurers, asset managers and property
 * owners, where free cash flow does not measure the business (told apart by
 * industry, not sector: Visa, Mastercard and the exchanges share the
 * Financials sector with the banks, and their cash flow does measure them);
 * and companies without a quality score or a free-cash-flow figure. A
 * foreign filer's cash flow is converted to its quote currency first.
 *
 * One company, one point: share classes (GOOGL and GOOG, FOXA and FOX) are
 * the same business, and two bubbles on one spot read as a glitch. The
 * class with the larger market cap stands for the company; the others are
 * named on its card.
 */

export const HG_RULES = {
  QUALITY_LINE: 60,
  CHEAP_YIELD: 0.04,
  /** The vertical axis, clamped: a 30% one-off yield would flatten the rest. */
  Y_MIN: -0.02,
  Y_MAX: 0.1,
  MIN_MARKET_CAP: 10_000_000_000,
  MAX_COMPANIES: 250,
} as const;

export type HgZone = "prime" | "paying-up" | "trap" | "avoid";

export const HG_ZONES: Record<HgZone, { label: string; line: string }> = {
  prime: { label: "Prime targets", line: "Quality, priced cheap" },
  "paying-up": { label: "Paying up", line: "Quality, priced in" },
  trap: { label: "Value traps", line: "Cheap for a reason" },
  avoid: { label: "Stay away", line: "Weak and expensive" },
};

export interface HgCompany {
  ticker: string;
  name: string;
  sector: string | null;
  marketCap: number;
  /** Today's move, a fraction. */
  change: number;
  logo?: string;
}

export interface HgMetrics {
  quality: number | null;
  profitability: number | null;
  financialHealth: number | null;
  growth: number | null;
  cashGeneration: number | null;
  fcfYield: number | null;
  /** Yahoo's industry, which decides whether a financial company is placed. */
  industry?: string | null;
  /** The currency the cash flow was converted from, for a foreign filer. */
  fxFrom?: string | null;
}

export interface HgPoint extends HgCompany, HgMetrics {
  quality: number;
  fcfYield: number;
  zone: HgZone;
  /** The company's other share classes, folded into this point. */
  otherClasses: string[];
}

export interface HuntingGround {
  points: HgPoint[];
  /** How many of the largest companies were considered. */
  considered: number;
  /** Left out: banks, insurers, asset managers, property owners. */
  financials: number;
  /** Left out: no quality score yet. */
  noQuality: number;
  /** Left out: no free-cash-flow figure. */
  noYield: number;
  /** Share classes folded into another point. */
  merged: number;
}

/** Sectors where the industry decides: lenders and landlords in, payment networks and exchanges out. */
const FINANCIAL_SECTOR = /financ|real estate/i;
/**
 * Industries free cash flow does not measure (Yahoo's names): a bank's cash
 * flow swings with its deposits and loans, an insurer's with its float.
 */
const UNMEASURED_INDUSTRY = /\b(banks?|insurance|reit|mortgage|capital markets|asset management|thrifts?|shell compan)|real estate - /i;

/** Whether free cash flow cannot measure this company, so it stays off the map. */
export function isUnmeasured(sector: string | null, industry: string | null | undefined): boolean {
  if (industry) return UNMEASURED_INDUSTRY.test(industry);
  // A financial or property company whose industry is unknown: left out
  // rather than placed on a figure that may mean nothing.
  return !!sector && FINANCIAL_SECTOR.test(sector);
}

/**
 * A company's name without its share class or legal suffix, to tell when two
 * tickers are one business: "Alphabet Inc. (Class A)" and "(Class C)" both
 * read "alphabet"; "Fox Corporation - Class A Common Stock", "fox".
 */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(class|series)\s+[a-z0-9]\b.*$/, " ")
    .replace(/[-–—,.&']/g, " ")
    .replace(/\b(common stock|ordinary shares|depositary shares|shares|inc|corp|corporation|plc|ltd|limited|holdings|co|company|the|n v|nv|s a|sa|ag)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function zoneOf(quality: number, fcfYield: number): HgZone {
  const good = quality >= HG_RULES.QUALITY_LINE;
  const cheap = fcfYield >= HG_RULES.CHEAP_YIELD;
  return good ? (cheap ? "prime" : "paying-up") : cheap ? "trap" : "avoid";
}

/**
 * Where a yield sits up the chart, 0 (bottom) to 1 (top). A square-root
 * scale: most large companies yield 0-4%, and on a straight scale they would
 * pile into a strip while a few 9% yields took the rest of the height.
 */
export function yPosition(fcfYield: number): number {
  const f = (v: number) => Math.sign(v) * Math.sqrt(Math.abs(v));
  const v = Math.min(HG_RULES.Y_MAX, Math.max(HG_RULES.Y_MIN, fcfYield));
  return (f(v) - f(HG_RULES.Y_MIN)) / (f(HG_RULES.Y_MAX) - f(HG_RULES.Y_MIN));
}

export function buildHuntingGround(
  companies: HgCompany[],
  metrics: Record<string, Partial<HgMetrics> | undefined>,
  // The market's map keeps the largest; a watchlist's keeps every company on it.
  { minMarketCap = HG_RULES.MIN_MARKET_CAP, maxCompanies = HG_RULES.MAX_COMPANIES }: { minMarketCap?: number; maxCompanies?: number } = {}
): HuntingGround {
  const largest = companies
    .filter((c) => c.marketCap >= minMarketCap)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, maxCompanies);

  let financials = 0;
  let noQuality = 0;
  let noYield = 0;
  let merged = 0;
  const points: HgPoint[] = [];
  // Largest first, so the first class seen of a company is the one kept.
  const byCompany = new Map<string, HgPoint>();
  for (const company of largest) {
    const m = metrics[company.ticker];
    if (isUnmeasured(company.sector, m?.industry)) {
      financials++;
      continue;
    }
    const key = companyKey(company.name) || company.ticker;
    const kept = byCompany.get(key);
    if (kept) {
      kept.otherClasses.push(company.ticker);
      merged++;
      continue;
    }
    if (m?.quality == null) {
      noQuality++;
      continue;
    }
    if (m.fcfYield == null || !Number.isFinite(m.fcfYield)) {
      noYield++;
      continue;
    }
    const point: HgPoint = {
      ...company,
      quality: m.quality,
      fcfYield: m.fcfYield,
      profitability: m.profitability ?? null,
      financialHealth: m.financialHealth ?? null,
      growth: m.growth ?? null,
      cashGeneration: m.cashGeneration ?? null,
      industry: m.industry ?? null,
      fxFrom: m.fxFrom ?? null,
      zone: zoneOf(m.quality, m.fcfYield),
      otherClasses: [],
    };
    byCompany.set(key, point);
    points.push(point);
  }
  return { points, considered: largest.length, financials, noQuality, noYield, merged };
}

/**
 * A zone's companies, best first: the furthest into the zone's corner
 * (prime: high quality and high yield; paying-up: highest quality; trap:
 * highest yield; avoid: weakest and dearest).
 */
export function rankZone(points: HgPoint[], zone: HgZone): HgPoint[] {
  const q = (p: HgPoint) => p.quality / 100;
  const y = (p: HgPoint) => yPosition(p.fcfYield);
  const score: Record<HgZone, (p: HgPoint) => number> = {
    prime: (p) => q(p) + y(p),
    "paying-up": (p) => q(p),
    trap: (p) => y(p),
    avoid: (p) => -(q(p) + y(p)),
  };
  return points.filter((p) => p.zone === zone).sort((a, b) => score[zone](b) - score[zone](a));
}

/** Space between a bubble's edge and its card, and between the card and the chart's edge. */
const CARD_GAP = 14;
const CARD_MARGIN = 6;

/**
 * Where the card goes: beside its bubble, a gap from its edge, on the right
 * when it fits and the left when not; centred on the bubble's height and
 * kept inside the chart. The bubble itself is never covered.
 */
export function placeCard(
  anchor: { x: number; y: number; r: number },
  card: { width: number; height: number },
  bounds: { width: number; height: number }
): { left: number; top: number } {
  const right = anchor.x + anchor.r + CARD_GAP;
  const leftSide = anchor.x - anchor.r - CARD_GAP - card.width;
  const fitsRight = right + card.width <= bounds.width - CARD_MARGIN;
  const fitsLeft = leftSide >= CARD_MARGIN;
  const left = fitsRight || !fitsLeft ? Math.min(right, bounds.width - CARD_MARGIN - card.width) : leftSide;
  const top = Math.min(Math.max(anchor.y - card.height / 2, CARD_MARGIN), bounds.height - CARD_MARGIN - card.height);
  return { left: Math.max(CARD_MARGIN, left), top: Math.max(CARD_MARGIN, top) };
}

export interface Bubble {
  id: string;
  /** Where the company's figures put it, in pixels. */
  x: number;
  y: number;
  r: number;
}

/**
 * Bubbles that would overlap, pushed apart: two companies with almost the
 * same quality and yield land on one spot, and the one underneath cannot
 * be reached. Each overlapping pair is moved apart along the line between
 * them, the smaller bubble more, and every bubble is pulled back towards
 * where its figures put it, so it moves only as far as it has to. The
 * figures themselves are on each company's card.
 */
export function separate(
  bubbles: Bubble[],
  bounds: { left: number; top: number; right: number; bottom: number },
  { gap = 2, iterations = 160 }: { gap?: number; iterations?: number } = {}
): Map<string, { x: number; y: number }> {
  const pos = bubbles.map((b) => ({ x: b.x, y: b.y }));
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = pos[i];
        const b = pos[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const min = bubbles[i].r + bubbles[j].r + gap;
        // Squared first: most pairs are far apart, and a square root for
        // each of them (tens of thousands a round) is what made this slow.
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          // On the very same spot: part them along a fixed angle per pair.
          const angle = ((i * 7 + j * 13) % 360) * (Math.PI / 180);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const push = min - d;
        const ux = dx / d;
        const uy = dy / d;
        // The smaller bubble moves more; a giant barely shifts.
        const share = bubbles[i].r / (bubbles[i].r + bubbles[j].r);
        a.x -= ux * push * (1 - share);
        a.y -= uy * push * (1 - share);
        b.x += ux * push * share;
        b.y += uy * push * share;
        moved = true;
      }
    }
    // Back towards the figures, a little each round, for the first rounds
    // only, so the last ones settle every overlap; and inside the frame.
    const pull = it < iterations * 0.5 ? 0.04 : 0;
    for (let i = 0; i < bubbles.length; i++) {
      const p = pos[i];
      const r = bubbles[i].r;
      p.x += (bubbles[i].x - p.x) * pull;
      p.y += (bubbles[i].y - p.y) * pull;
      p.x = Math.min(Math.max(p.x, bounds.left + r), bounds.right - r);
      p.y = Math.min(Math.max(p.y, bounds.top + r), bounds.bottom - r);
    }
    if (!moved) break;
  }
  return new Map(bubbles.map((b, i) => [b.id, pos[i]]));
}
