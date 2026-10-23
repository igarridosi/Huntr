/**
 * Which headlines the Insights page shows, in two rows.
 *
 *  Markets: what the market as a whole is doing.
 *   - The latest market-wide stories (a wrap of the session, a big index
 *     move, futures before the open), from the news Yahoo tags with the
 *     S&P 500, the Nasdaq and the Dow; about the market, not a list of
 *     "stocks to buy".
 *   - Then gold, crude oil, the 10-year Treasury yield and bitcoin: each
 *     one's latest stories that are about it ("oil" in an oil story), the
 *     asset that moved most first.
 *
 *  Stocks: large companies ($50B+) that moved in a way worth explaining:
 *   - a 5% move;
 *   - a 3.5% move for a $100B+ company;
 *   - a 2% move for a mega cap ($200B+), the names everyone knows;
 *   - or a 3% move on twice the usual volume, what is in fashion today.
 *   Bigger companies rank first for the same move. A company gets a card
 *   only when a headline names it (Yahoo's news for a ticker includes market
 *   wraps that merely list it), and the one reporting the move is preferred.
 *
 * A story is shown once, whichever row and symbol it came through.
 */

export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  /** https only; checked where it is fetched. */
  link: string;
  /** ISO. */
  publishedAt: string;
  /** Symbols Yahoo tags the story with. */
  related: string[];
}

export const NEWS_RULES = {
  MIN_MARKET_CAP: 50_000_000_000,
  BIG_MOVE: 0.05,
  LARGE_CAP: 100_000_000_000,
  LARGE_CAP_MOVE: 0.035,
  MEGA_CAP: 200_000_000_000,
  MEGA_CAP_MOVE: 0.02,
  UNUSUAL_VOLUME: 2,
  TRENDING_MOVE: 0.03,
  /** Cards per row: enough to be worth scrolling. */
  ROW_CARDS: 10,
  /** Market wraps shown at most, before the assets. */
  WRAP_CARDS: 3,
  /** Stories per asset at most, so oil does not crowd out gold. */
  ASSET_CARDS: 2,
  /** Asked for more than the row holds: not every mover has a headline naming it. */
  COMPANY_CANDIDATES: 16,
  /** Market wraps go stale fast: the last session and the night after it. */
  MARKET_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  /** Covers the night before and a session, not last week's story. */
  MAX_AGE_MS: 36 * 60 * 60 * 1000,
} as const;

/** The indices whose news makes the market wraps. */
export const NEWS_INDICES = ["^GSPC", "^IXIC", "^DJI"] as const;

export type AssetTopic = "gold" | "oil" | "rates" | "bitcoin";

/** The assets in the Markets row, with what a story about each one says. */
export const NEWS_ASSETS: ReadonlyArray<{ symbol: string; topic: AssetTopic; label: string; match: RegExp }> = [
  { symbol: "GC=F", topic: "gold", label: "Gold", match: /\bgold\b/i },
  { symbol: "CL=F", topic: "oil", label: "Crude oil", match: /\b(oil|crude|brent|wti|opec)\b/i },
  { symbol: "^TNX", topic: "rates", label: "10Y Treasury", match: /\b(treasur(?:y|ies)|yields?|bonds?|fed|rates?)\b/i },
  { symbol: "BTC-USD", topic: "bitcoin", label: "Bitcoin", match: /\b(bitcoin|btc|crypto)\b/i },
];

/** Every symbol whose news the Markets row reads. */
export const MARKET_NEWS_SYMBOLS: string[] = [...NEWS_INDICES, ...NEWS_ASSETS.map((a) => a.symbol)];

export type NewsReason = "big-move" | "large-cap" | "mega-cap" | "trending";

export interface CompanyMove {
  ticker: string;
  name: string;
  /** Fraction: 0.05 is +5%. */
  changePercent: number;
  marketCap: number;
  /** Today's volume over the average; 0 when unknown. */
  volumeRatio: number;
}

export interface NewsCandidate {
  symbol: string;
  label: string;
  changePercent: number;
  reason: NewsReason;
  /** How far past its bar the move is, weighted towards larger companies. */
  notability: number;
}

export type NewsCard =
  /**
   * A Markets card. `source`: the symbol whose news the story came from
   * (where its summary is looked up). `topic`: "market" for a wrap, else the
   * asset it is about.
   */
  | { kind: "market"; source: string; topic: "market" | AssetTopic; item: NewsItem }
  | { kind: "company"; candidate: NewsCandidate; item: NewsItem };

/** The symbol whose cached news holds the card's story. */
export const cardSource = (card: NewsCard): string => (card.kind === "market" ? card.source : card.candidate.symbol);

/** The companies worth a headline today, most notable first. */
export function pickNewsCandidates(companies: CompanyMove[]): NewsCandidate[] {
  return companies
    .flatMap<NewsCandidate>((c) => {
      const move = Math.abs(c.changePercent);
      if (!Number.isFinite(move) || c.marketCap < NEWS_RULES.MIN_MARKET_CAP) return [];
      let reason: NewsReason;
      if (move >= NEWS_RULES.BIG_MOVE) reason = "big-move";
      else if (move >= NEWS_RULES.LARGE_CAP_MOVE && c.marketCap >= NEWS_RULES.LARGE_CAP) reason = "large-cap";
      else if (move >= NEWS_RULES.MEGA_CAP_MOVE && c.marketCap >= NEWS_RULES.MEGA_CAP) reason = "mega-cap";
      else if (move >= NEWS_RULES.TRENDING_MOVE && c.volumeRatio >= NEWS_RULES.UNUSUAL_VOLUME) reason = "trending";
      else return [];
      // The move first, the size as a bonus ($50B weighs 1, $500B 1.5, $5T
      // 2): for the same move the bigger name wins, but a mega cap's 2% does
      // not outrank a $130B company's 6%.
      const size = 1 + 0.5 * Math.log10(c.marketCap / NEWS_RULES.MIN_MARKET_CAP);
      return [{ symbol: c.ticker, label: c.name, changePercent: c.changePercent, reason, notability: move * size }];
    })
    .sort((a, b) => b.notability - a.notability)
    .slice(0, NEWS_RULES.COMPANY_CANDIDATES);
}

const NAME_STOPWORDS = new Set(["the", "a", "an"]);

/** The word a headline uses for a company: "Nvidia" for "Nvidia Corporation", "Walt" never. */
export function nameKeyword(name: string): string | null {
  const words = name
    .replace(/[.,()&]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !NAME_STOPWORDS.has(w.toLowerCase()));
  const first = words[0];
  return first && first.length >= 3 ? first : null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** About the market as a whole… */
const MARKET_RE = /\b(dow|s&p|nasdaq|stock market|wall street|stock futures|markets|sell-?off|rally)\b/i;
/** …and not a stock pick, a comparison or a teaser, which name companies without explaining a move. */
const PICK_RE =
  /\b(to buy|buy now|should you|is it time|top \d+|best stocks?|\d+ stocks?|which stock|vs\.?|versus|little-known|best-kept|millionaire|could soar|forever|not \w+\.)(?=\W|$)/i;
/**
 * Wire data feeds ("BC-Gold Futures"), market-research filler, and exchange
 * notices ("Nasdaq confirms X's return to compliance"), which name an index's
 * exchange without being about the market.
 */
const JUNK_RE =
  /^BC-|\bmarket (?:size|report|forecast)|\bforecast to 20\d\d\b|\bCAGR\b|\bcompliance\b|\blisting (?:rule|requirement|standard)s?\b|\bdelisting\b|\bnotice from (?:nasdaq|nyse)\b/i;
/** A headline that reports a move: what explains a card's percentage. */
const MOVE_RE =
  /\b(rises?|rising|rose|falls?|falling|fell|jumps?|jumped|soars?|soared|sinks?|sank|slides?|slid|surges?|surged|drops?|dropped|climbs?|climbed|tumbles?|tumbled|plunges?|plunged|rall(?:y|ies|ied)|gains?|gained|slumps?|slumped|rebounds?|rebounded|skids?|spikes?|spiked|dips?|dipped|pops?|popped|sell-?off|shares? (?:up|down))\b|\d+(?:\.\d+)?%/i;

const isNoise = (item: NewsItem) => PICK_RE.test(item.title) || JUNK_RE.test(item.title);

const UP_RE =
  /\b(rises?|rising|rose|jumps?|jumped|soars?|soared|surges?|surged|climbs?|climbed|rall(?:y|ies|ied)|gains?|gained|rebounds?|rebounded|spikes?|spiked|pops?|popped)\b/i;
const DOWN_RE =
  /\b(falls?|falling|fell|sinks?|sank|slides?|slid|drops?|dropped|tumbles?|tumbled|plunges?|plunged|slumps?|slumped|skids?|dips?|dipped|sell-?off)\b/i;

/**
 * A headline reporting a move the other way ("AMD slides 8%" on a day it is
 * up 2%): yesterday's story, which would explain nothing about today.
 */
export function contradictsMove(item: NewsItem, change: number): boolean {
  const up = UP_RE.test(item.title);
  const down = DOWN_RE.test(item.title);
  return change > 0 ? down && !up : change < 0 ? up && !down : false;
}

export function isMarketStory(item: NewsItem): boolean {
  return MARKET_RE.test(item.title) && !isNoise(item);
}

function namesCompany(candidate: NewsCandidate, item: NewsItem): boolean {
  if (!item.related.includes(candidate.symbol) || isNoise(item)) return false;
  const words = [candidate.symbol, nameKeyword(candidate.label)].filter((w): w is string => !!w);
  return words.some((w) => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(w)}([^A-Za-z0-9]|$)`, "i").test(item.title));
}

function within(item: NewsItem, now: number, maxAge: number): boolean {
  const age = now - new Date(item.publishedAt).getTime();
  return age >= -5 * 60 * 1000 && age <= maxAge;
}

const newestFirst = (a: NewsItem, b: NewsItem) => b.publishedAt.localeCompare(a.publishedAt);

type NewsBySymbol = Record<string, NewsItem[] | undefined>;

/**
 * The Markets row: the latest market wraps, then each asset's stories, the
 * asset that moved most first, one story each before any gets a second.
 * `used` collects the stories shown, so the Stocks row can skip them.
 */
export function buildMarketCards(
  news: NewsBySymbol,
  now: number,
  change: (symbol: string) => number | undefined,
  used: Set<string> = new Set()
): NewsCard[] {
  const cards: NewsCard[] = [];

  const wraps = NEWS_INDICES.flatMap((source) => (news[source] ?? []).map((item) => ({ source, item })))
    .filter(({ item }) => within(item, now, NEWS_RULES.MARKET_MAX_AGE_MS) && isMarketStory(item))
    .sort((a, b) => newestFirst(a.item, b.item));
  for (const { source, item } of wraps) {
    if (cards.length >= NEWS_RULES.WRAP_CARDS) break;
    if (used.has(item.id)) continue;
    used.add(item.id);
    cards.push({ kind: "market", source, topic: "market", item });
  }

  const byMove = [...NEWS_ASSETS].sort((a, b) => Math.abs(change(b.symbol) ?? 0) - Math.abs(change(a.symbol) ?? 0));
  const queues = byMove.map((asset) => ({
    asset,
    stories: (news[asset.symbol] ?? [])
      .filter((n) => within(n, now, NEWS_RULES.MAX_AGE_MS) && asset.match.test(n.title) && !isNoise(n))
      .sort(newestFirst),
  }));
  for (let round = 0; round < NEWS_RULES.ASSET_CARDS; round++) {
    for (const { asset, stories } of queues) {
      if (cards.length >= NEWS_RULES.ROW_CARDS) return cards;
      const item = stories.find((n) => !used.has(n.id));
      if (!item) continue;
      used.add(item.id);
      cards.push({ kind: "market", source: asset.symbol, topic: asset.topic, item });
    }
  }
  return cards;
}

/** The Stocks row: one story per company that names it, the one reporting the move preferred. */
export function buildStockCards(
  candidates: NewsCandidate[],
  news: NewsBySymbol,
  now: number,
  used: Set<string> = new Set()
): NewsCard[] {
  const cards: NewsCard[] = [];
  for (const candidate of candidates) {
    if (cards.length >= NEWS_RULES.ROW_CARDS) break;
    const stories = (news[candidate.symbol] ?? [])
      .filter(
        (n) =>
          within(n, now, NEWS_RULES.MAX_AGE_MS) &&
          !used.has(n.id) &&
          namesCompany(candidate, n) &&
          !contradictsMove(n, candidate.changePercent)
      )
      .sort(newestFirst);
    const item = stories.find((n) => MOVE_RE.test(n.title)) ?? stories[0];
    if (!item) continue;
    used.add(item.id);
    cards.push({ kind: "company", candidate, item });
  }
  return cards;
}

/** Of `symbols`, the one the story is tagged with that moved most: what a market card leads with. */
export function biggestMover(
  item: NewsItem,
  symbols: string[],
  change: (symbol: string) => number | undefined
): string | null {
  let best: string | null = null;
  let bestMove = -1;
  for (const symbol of symbols) {
    const value = change(symbol);
    if (value == null || !item.related.includes(symbol)) continue;
    if (Math.abs(value) > bestMove) {
      best = symbol;
      bestMove = Math.abs(value);
    }
  }
  return best;
}

/** The symbols a story is tagged with that the page can say something about, in Yahoo's order. */
export function involvedSymbols(item: NewsItem, known: (symbol: string) => boolean, limit = 6): string[] {
  return item.related.filter(known).slice(0, limit);
}

// ── Preview summary ─────────────────────────────────────────────────────────
// The article's own description (its og:description): the teaser the
// publisher writes for link previews. Never the article's text.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const META_TAG_RE = /<meta\b[^>]*>/gi;

/** og:description, else description, from a page's HTML; null when there is none worth showing. */
export function extractDescription(html: string, maxLength = 420): string | null {
  const found: Record<string, string> = {};
  for (const tag of html.match(META_TAG_RE) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag);
    if (!key || !content || found[key]) continue;
    found[key] = content[1] ?? content[2] ?? "";
  }
  const raw = found["og:description"] || found["description"];
  if (!raw) return null;
  const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
  if (text.length < 40) return null;
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const sentence = cut.lastIndexOf(". ");
  return sentence > maxLength * 0.5 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
