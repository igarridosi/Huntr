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
 * Source: https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/all/all_tickers.json
 * Alternative: https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv
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
  /** All US tickers — JSON array of strings (symbols only) */
  ALL_US:
    "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/all/all_tickers.json",
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
    .filter((row): row is SP500Row => row !== null && row.symbol.length > 0);
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

  // ── Step 1: Fetch S&P 500 list (primary — has names + sectors) ──
  console.log("📡 Fetching S&P 500 constituents...");
  let tickers: SP500Row[] = [];

  try {
    const response = await fetch(TICKER_SOURCES.SP500);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csv = await response.text();
    tickers = parseCSV(csv);
    console.log(`   ✅ Parsed ${tickers.length} S&P 500 tickers\n`);
  } catch (error) {
    console.error("   ⚠️  Failed to fetch S&P 500 list:", error);
    console.log("   Falling back to a minimal built-in list.\n");
    tickers = getFallbackTickers();
  }

  // ── Step 1.5: Resolve website domains for ticker logos (AllInvestView) ──
  console.log("🔎 Resolving logo domains from AllInvestView...");
  tickers = await enrichTickersWithWebsites(tickers);
  const withWebsite = tickers.filter((t) => t.website.length > 0).length;
  console.log(`   ✅ Resolved ${withWebsite}/${tickers.length} ticker domains\n`);

  // ── Step 2: Upsert into Supabase ──
  console.log("💾 Upserting into Supabase `tickers` table...");

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
