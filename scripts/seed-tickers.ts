/**
 * Seed Tickers Script
 *
 * Fetches a public JSON of US stock tickers from GitHub and inserts them
 * into Supabase's `tickers` table. This powers the search/autocomplete
 * feature since Yahoo Finance doesn't provide a "list all tickers" endpoint.
 *
 * Usage:
 *   npx tsx scripts/seed-tickers.ts
 *
 * Requirements:
 *   - Environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - Supabase table `tickers` must exist (see migration below).
 *
 * Sources:
 * - S&P 500 constituents (symbol, name, sector)
 * - Nasdaq Trader listings (NASDAQ + other exchanges, includes NYSE names)
 * - Dow Jones constituents (extra quality labels)
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env.local (Node.js doesn't load them automatically)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TICKER_SOURCES = {
  /** S&P 500 constituents — CSV with Symbol, Name, Sector */
  SP500:
    "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
  /** NASDAQ official listed file */
  NASDAQ_LISTED:
    "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
  /** Other listed (NYSE/AMEX/etc) */
  OTHER_LISTED:
    "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
  /** Dow Jones constituents */
  DOW:
    "https://raw.githubusercontent.com/datasets/dow-jones/master/data/dow-jones.csv",
} as const;

// ─────────────────────────────────────────────────────────
// CSV Parser (minimal, no dependencies)
// ─────────────────────────────────────────────────────────

interface SP500Row {
  symbol: string;
  name: string;
  sector: string;
  website: string;
}

interface SeedTickerRow {
  symbol: string;
  name: string;
  sector: string;
  website: string;
}

const NON_EQUITY_NAME_PATTERNS: RegExp[] = [
  /\bETF\b/i,
  /\bETN\b/i,
  /\bETP\b/i,
  /\bINCOME STRATEGY\b/i,
  /\b2X\b/i,
  /\b3X\b/i,
  /\bULTRA\b/i,
  /\bLEVERAGED\b/i,
  /\bBULL\b/i,
  /\bBEAR\b/i,
];

function isLikelyCommonStockName(name: string): boolean {
  if (!name) return false;
  return !NON_EQUITY_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function getDowFallbackTickers(): SeedTickerRow[] {
  return [
    ["AAPL", "Apple Inc."],
    ["AMGN", "Amgen Inc."],
    ["AMZN", "Amazon.com, Inc."],
    ["AXP", "American Express Company"],
    ["BA", "The Boeing Company"],
    ["CAT", "Caterpillar Inc."],
    ["CRM", "Salesforce, Inc."],
    ["CSCO", "Cisco Systems, Inc."],
    ["CVX", "Chevron Corporation"],
    ["DIS", "The Walt Disney Company"],
    ["GS", "The Goldman Sachs Group, Inc."],
    ["HD", "The Home Depot, Inc."],
    ["HON", "Honeywell International Inc."],
    ["IBM", "International Business Machines Corporation"],
    ["JNJ", "Johnson & Johnson"],
    ["JPM", "JPMorgan Chase & Co."],
    ["KO", "The Coca-Cola Company"],
    ["MCD", "McDonald's Corporation"],
    ["MMM", "3M Company"],
    ["MRK", "Merck & Co., Inc."],
    ["MSFT", "Microsoft Corporation"],
    ["NKE", "NIKE, Inc."],
    ["NVDA", "NVIDIA Corporation"],
    ["PG", "The Procter & Gamble Company"],
    ["SHW", "The Sherwin-Williams Company"],
    ["TRV", "The Travelers Companies, Inc."],
    ["UNH", "UnitedHealth Group Incorporated"],
    ["V", "Visa Inc."],
    ["VZ", "Verizon Communications Inc."],
    ["WMT", "Walmart Inc."],
  ].map(([symbol, name]) => ({
    symbol,
    name,
    sector: "Dow Jones",
    website: "",
  }));
}

function parseCSV(csv: string): SP500Row[] {
  const lines = csv.trim().split("\n");
  // Header: Symbol,Name,Sector
  const rows = lines.slice(1);

  return rows
    .map((line) => {
      // Handle possible quoted fields
      const parts = line.split(",");
      if (parts.length < 3) return null;
      return {
        symbol: parts[0].trim().replace(/"/g, ""),
        name: parts[1].trim().replace(/"/g, ""),
        sector: parts[2].trim().replace(/"/g, ""),
        website: "",
      };
    })
    .filter(
      (row): row is SP500Row =>
        row !== null && row.symbol.length > 0 && isLikelyCommonStockName(row.name)
    );
}

function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\^/g, "");
}

function isValidCommonStockSymbol(symbol: string): boolean {
  if (!symbol) return false;
  if (symbol.includes("$")) return false;
  if (symbol.includes("/")) return false;
  if (symbol.includes(" ")) return false;
  return /^[A-Z.\-]{1,10}$/.test(symbol);
}

function parsePipeTable(text: string): string[][] {
  const lines = text
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const rows = lines
    .slice(1)
    .filter((line) => !line.startsWith("File Creation Time"))
    .map((line) => line.split("|").map((part) => part.trim()));

  return rows;
}

function parseNasdaqListed(text: string): SeedTickerRow[] {
  const rows = parsePipeTable(text);
  return rows
    .map((parts) => {
      const symbol = normalizeSymbol(parts[0] ?? "");
      const name = (parts[1] ?? symbol).replace(/\$/g, "").trim();
      const etfFlag = (parts[6] ?? "").trim().toUpperCase() === "Y";

      if (!isValidCommonStockSymbol(symbol)) return null;
      if (etfFlag) return null;
      if (!isLikelyCommonStockName(name)) return null;

      return {
        symbol,
        name: name || symbol,
        sector: "Unknown",
        website: "",
      };
    })
    .filter((row): row is SeedTickerRow => row !== null);
}

function parseOtherListed(text: string): SeedTickerRow[] {
  const rows = parsePipeTable(text);
  return rows
    .map((parts) => {
      const cqs = normalizeSymbol(parts[3] ?? "");
      const act = normalizeSymbol(parts[0] ?? "");
      const symbol = cqs || act;
      const name = (parts[1] ?? symbol).replace(/\$/g, "").trim();
      const etfFlag = (parts[4] ?? "").trim().toUpperCase() === "Y";

      if (!isValidCommonStockSymbol(symbol)) return null;
      if (etfFlag) return null;
      if (!isLikelyCommonStockName(name)) return null;

      return {
        symbol,
        name: name || symbol,
        sector: "Unknown",
        website: "",
      };
    })
    .filter((row): row is SeedTickerRow => row !== null);
}

function parseDowCSV(csv: string): SeedTickerRow[] {
  const lines = csv.trim().split("\n");
  const rows = lines.slice(1);
  return rows
    .map((line) => {
      const parts = line.split(",");
      if (parts.length < 2) return null;
      const symbol = normalizeSymbol(parts[0]?.replace(/"/g, "") ?? "");
      const name = parts[1]?.replace(/"/g, "").trim() ?? symbol;
      if (!isValidCommonStockSymbol(symbol)) return null;
      if (!isLikelyCommonStockName(name)) return null;
      return {
        symbol,
        name: name || symbol,
        sector: "Dow Jones",
        website: "",
      };
    })
    .filter((row): row is SeedTickerRow => row !== null);
}

function mergeTickers(sources: SeedTickerRow[][]): SeedTickerRow[] {
  const merged = new Map<string, SeedTickerRow>();

  for (const sourceRows of sources) {
    for (const row of sourceRows) {
      const symbol = normalizeSymbol(row.symbol);
      if (!isValidCommonStockSymbol(symbol)) continue;
      if (!isLikelyCommonStockName(row.name)) continue;

      const existing = merged.get(symbol);
      if (!existing) {
        merged.set(symbol, { ...row, symbol });
        continue;
      }

      const betterName =
        existing.name === symbol && row.name !== symbol ? row.name : existing.name;
      const betterSector =
        existing.sector === "Unknown" && row.sector !== "Unknown"
          ? row.sector
          : existing.sector;

      merged.set(symbol, {
        symbol,
        name: betterName,
        sector: betterSector,
        website: existing.website || row.website,
      });
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

interface LogoSearchResult {
  symbol: string;
  website: string;
}

interface LogoSearchResponse {
  query: string;
  count: number;
  results: LogoSearchResult[];
}

function normalizeDomain(website: string | null | undefined): string {
  if (!website) return "";
  const cleaned = website.trim().toLowerCase();
  if (!cleaned) return "";
  const withoutProtocol = cleaned.replace(/^https?:\/\//, "");
  return withoutProtocol.replace(/^www\./, "").replace(/\/$/, "");
}

async function fetchWebsiteDomainForTicker(symbol: string): Promise<string> {
  try {
    const endpoint = `https://www.allinvestview.com/api/logo-search/?q=${encodeURIComponent(symbol)}`;
    const response = await fetch(endpoint);
    if (!response.ok) return "";

    const body = (await response.json()) as LogoSearchResponse;
    if (!body?.results?.length) return "";

    const exact = body.results.find(
      (r) => r.symbol?.toUpperCase() === symbol.toUpperCase()
    );
    const pick = exact ?? body.results[0];
    return normalizeDomain(pick?.website ?? "");
  } catch {
    return "";
  }
}

async function enrichTickersWithWebsites(tickers: SP500Row[]): Promise<SP500Row[]> {
  const CONCURRENCY = 12;
  const enriched = [...tickers];

  for (let i = 0; i < enriched.length; i += CONCURRENCY) {
    const chunk = enriched.slice(i, i + CONCURRENCY);
    const resolved = await Promise.all(
      chunk.map((ticker) => fetchWebsiteDomainForTicker(ticker.symbol))
    );

    resolved.forEach((website, idx) => {
      enriched[i + idx] = {
        ...enriched[i + idx],
        website,
      };
    });

    const done = Math.min(i + CONCURRENCY, enriched.length);
    console.log(`   • Resolved logo domains: ${done}/${enriched.length}`);
  }

  return enriched;
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main() {
  console.log("🐺 Huntr Ticker Seed — Starting...\n");

  // Validate env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      "❌ Missing environment variables:\n" +
        "   NEXT_PUBLIC_SUPABASE_URL\n" +
        "   SUPABASE_SERVICE_ROLE_KEY\n\n" +
        "Set them in your .env.local file."
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Step 1: Fetch multiple sources (independent, no global fallback) ──
  console.log("📡 Fetching ticker universes (S&P 500 + NASDAQ + NYSE + DOW)...");

  const fetchText = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  };

  const [sp500Csv, nasdaqTxt, otherTxt, dowCsv] = await Promise.all([
    fetchText(TICKER_SOURCES.SP500),
    fetchText(TICKER_SOURCES.NASDAQ_LISTED),
    fetchText(TICKER_SOURCES.OTHER_LISTED),
    fetchText(TICKER_SOURCES.DOW),
  ]);

  let sp500Rows: SeedTickerRow[] = sp500Csv ? parseCSV(sp500Csv) : getFallbackTickers();
  let nasdaqRows: SeedTickerRow[] = nasdaqTxt ? parseNasdaqListed(nasdaqTxt) : [];
  let otherRows: SeedTickerRow[] = otherTxt ? parseOtherListed(otherTxt) : [];
  let dowRows: SeedTickerRow[] = dowCsv ? parseDowCSV(dowCsv) : getDowFallbackTickers();

  console.log(`   • S&P 500 rows: ${sp500Rows.length}${sp500Csv ? "" : " (fallback)"}`);
  console.log(`   • NASDAQ listed rows: ${nasdaqRows.length}${nasdaqTxt ? "" : " (failed)"}`);
  console.log(`   • NYSE/Other listed rows: ${otherRows.length}${otherTxt ? "" : " (failed)"}`);
  console.log(`   • DOW rows: ${dowRows.length}${dowCsv ? "" : " (fallback)"}\n`);

  if (nasdaqRows.length === 0 && otherRows.length === 0) {
    console.warn("   ⚠️ Could not fetch NASDAQ/NYSE listings. Seed will be limited.");
  }

  let tickers = mergeTickers([sp500Rows, dowRows, nasdaqRows, otherRows]);
  console.log(`   ✅ Merged unique symbols: ${tickers.length}\n`);

  // ── Step 1.5: Resolve website domains for ticker logos (AllInvestView) ──
  const prioritySymbols = new Set(sp500Rows.map((row) => row.symbol.toUpperCase()));
  const priorityRows = tickers.filter((row) => prioritySymbols.has(row.symbol));

  console.log("🔎 Resolving logo domains for priority universe (S&P 500)...");
  const enrichedPriority = await enrichTickersWithWebsites(priorityRows);
  const websiteMap = new Map(enrichedPriority.map((row) => [row.symbol.toUpperCase(), row.website]));

  tickers = tickers.map((row) => ({
    ...row,
    website: websiteMap.get(row.symbol.toUpperCase()) ?? row.website,
  }));

  const withWebsite = tickers.filter((row) => row.website.length > 0).length;
  console.log(`   ✅ Resolved ${withWebsite}/${tickers.length} ticker domains\n`);

  // ── Step 2: Upsert into Supabase ──
  console.log("💾 Upserting into Supabase `tickers` table...");

  const { error: deactivateAllError } = await supabase
    .from("tickers")
    .update({ is_active: false })
    .neq("is_active", false);

  if (deactivateAllError) {
    console.warn(`   ⚠️ Could not pre-deactivate current universe: ${deactivateAllError.message}`);
  }

  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE).map((t) => ({
      symbol: t.symbol.toUpperCase(),
      name: t.name,
      sector: t.sector,
      website: t.website,
      is_active: true,
    }));

    const { error } = await supabase
      .from("tickers")
      .upsert(batch, { onConflict: "symbol" });

    if (error) {
      console.error(`   ❌ Batch ${i / BATCH_SIZE + 1} error:`, error.message);
      errors++;
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\n🏁 Seed complete!`);
  console.log(`   Inserted/updated: ${inserted} tickers`);
  if (errors > 0) console.log(`   Batches with errors: ${errors}`);
  console.log("");
}

// ─────────────────────────────────────────────────────────
// Fallback (if GitHub fetch fails)
// ─────────────────────────────────────────────────────────

function getFallbackTickers(): SP500Row[] {
  return [
    { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", website: "apple.com" },
    { symbol: "MSFT", name: "Microsoft Corporation", sector: "Technology", website: "microsoft.com" },
    { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Communication Services", website: "abc.xyz" },
    { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Discretionary", website: "amazon.com" },
    { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Technology", website: "nvidia.com" },
    { symbol: "META", name: "Meta Platforms Inc.", sector: "Communication Services", website: "meta.com" },
    { symbol: "TSLA", name: "Tesla Inc.", sector: "Consumer Discretionary", website: "tesla.com" },
    { symbol: "BRK.B", name: "Berkshire Hathaway Inc.", sector: "Financials", website: "berkshirehathaway.com" },
    { symbol: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials", website: "jpmorganchase.com" },
    { symbol: "V", name: "Visa Inc.", sector: "Financials", website: "visa.com" },
    { symbol: "JNJ", name: "Johnson & Johnson", sector: "Health Care", website: "jnj.com" },
    { symbol: "WMT", name: "Walmart Inc.", sector: "Consumer Staples", website: "walmart.com" },
    { symbol: "PG", name: "Procter & Gamble Co.", sector: "Consumer Staples", website: "pg.com" },
    { symbol: "MA", name: "Mastercard Inc.", sector: "Financials", website: "mastercard.com" },
    { symbol: "HD", name: "The Home Depot Inc.", sector: "Consumer Discretionary", website: "homedepot.com" },
    { symbol: "CVX", name: "Chevron Corporation", sector: "Energy", website: "chevron.com" },
    { symbol: "MRK", name: "Merck & Co. Inc.", sector: "Health Care", website: "merck.com" },
    { symbol: "ABBV", name: "AbbVie Inc.", sector: "Health Care", website: "abbvie.com" },
    { symbol: "KO", name: "The Coca-Cola Company", sector: "Consumer Staples", website: "coca-colacompany.com" },
    { symbol: "PEP", name: "PepsiCo Inc.", sector: "Consumer Staples", website: "pepsico.com" },
    { symbol: "COST", name: "Costco Wholesale Corp.", sector: "Consumer Staples", website: "costco.com" },
    { symbol: "TMO", name: "Thermo Fisher Scientific", sector: "Health Care", website: "thermofisher.com" },
    { symbol: "AVGO", name: "Broadcom Inc.", sector: "Technology", website: "broadcom.com" },
    { symbol: "MCD", name: "McDonald's Corporation", sector: "Consumer Discretionary", website: "mcdonalds.com" },
    { symbol: "CSCO", name: "Cisco Systems Inc.", sector: "Technology", website: "cisco.com" },
    { symbol: "ACN", name: "Accenture plc", sector: "Technology", website: "accenture.com" },
    { symbol: "ABT", name: "Abbott Laboratories", sector: "Health Care", website: "abbott.com" },
    { symbol: "DHR", name: "Danaher Corporation", sector: "Health Care", website: "danaher.com" },
    { symbol: "TXN", name: "Texas Instruments Inc.", sector: "Technology", website: "ti.com" },
    { symbol: "NEE", name: "NextEra Energy Inc.", sector: "Utilities", website: "nexteraenergy.com" },
    { symbol: "O", name: "Realty Income Corp.", sector: "Real Estate", website: "realtyincome.com" },
    { symbol: "CMG", name: "Chipotle Mexican Grill", sector: "Consumer Discretionary", website: "chipotle.com" },
    { symbol: "ASML", name: "ASML Holding N.V.", sector: "Technology", website: "asml.com" },
    { symbol: "INTU", name: "Intuit Inc.", sector: "Technology", website: "intuit.com" },
    { symbol: "TGT", name: "Target Corporation", sector: "Consumer Staples", website: "target.com" },
  ];
}

// ─────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
