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
 * Left out, and said so: banks, insurers and property, where free cash flow
 * does not measure the business; and companies without a quality score or a
 * comparable yield (a foreign listing reporting in another currency).
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
}

export interface HgPoint extends HgCompany, HgMetrics {
  quality: number;
  fcfYield: number;
  zone: HgZone;
}

export interface HuntingGround {
  points: HgPoint[];
  /** Left out because free cash flow does not measure them. */
  financials: number;
  /** Left out for want of a quality score or a comparable yield. */
  unscored: number;
}

const FINANCIAL_SECTOR = /financ|bank|insur|real estate|reit/i;

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

export function buildHuntingGround(companies: HgCompany[], metrics: Record<string, Partial<HgMetrics> | undefined>): HuntingGround {
  const largest = companies
    .filter((c) => c.marketCap >= HG_RULES.MIN_MARKET_CAP)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, HG_RULES.MAX_COMPANIES);

  let financials = 0;
  let unscored = 0;
  const points: HgPoint[] = [];
  for (const company of largest) {
    if (company.sector && FINANCIAL_SECTOR.test(company.sector)) {
      financials++;
      continue;
    }
    const m = metrics[company.ticker];
    if (m?.quality == null || m.fcfYield == null || !Number.isFinite(m.fcfYield)) {
      unscored++;
      continue;
    }
    points.push({
      ...company,
      quality: m.quality,
      fcfYield: m.fcfYield,
      profitability: m.profitability ?? null,
      financialHealth: m.financialHealth ?? null,
      growth: m.growth ?? null,
      cashGeneration: m.cashGeneration ?? null,
      zone: zoneOf(m.quality, m.fcfYield),
    });
  }
  return { points, financials, unscored };
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
