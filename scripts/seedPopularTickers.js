import "dotenv/config";
import { prewarmEarningsDetailCacheForTickers } from "../src/lib/api/earnings-detail";

const POPULAR_SP500_TICKERS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "BRK-B", "TSLA", "JPM", "V",
  "MA", "AVGO", "UNH", "XOM", "LLY", "WMT", "COST", "PG", "JNJ", "HD",
  "MRK", "ABBV", "PEP", "KO", "BAC", "ORCL", "CRM", "CVX", "AMD", "ADBE",
  "CSCO", "ACN", "MCD", "TMO", "DHR", "PFE", "ABT", "LIN", "CMCSA", "DIS",
  "NFLX", "INTC", "WFC", "TXN", "QCOM", "NKE", "PM", "UNP", "AMGN", "LOW",
  "RTX", "HON", "UPS", "NEE", "MS", "GS", "ISRG", "INTU", "SCHW", "SPGI",
  "BLK", "CAT", "DE", "SYK", "MDT", "GILD", "BKNG", "ADP", "AXP", "PLD",
  "CB", "C", "TJX", "MMC", "LMT", "AMT", "VRTX", "MO", "SO", "DUK",
  "TMUS", "T", "COP", "ELV", "MDLZ", "CL", "ZTS", "AON", "PYPL", "PNC",
  "USB", "CSX", "ITW", "SNPS", "ADI", "MU", "REGN", "ICE", "CI", "BDX",
];

async function run() {
  console.log("[seedPopularTickers] Starting prewarm for popular S&P 500 tickers...");

  const summary = await prewarmEarningsDetailCacheForTickers(POPULAR_SP500_TICKERS);

  console.log("[seedPopularTickers] Done");
  console.log(`[seedPopularTickers] Total: ${summary.total}`);
  console.log(`[seedPopularTickers] Warmed: ${summary.warmed}`);
  console.log(`[seedPopularTickers] Failed: ${summary.failed.length}`);

  if (summary.failed.length > 0) {
    console.log(`[seedPopularTickers] Failed tickers: ${summary.failed.join(", ")}`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("[seedPopularTickers] Fatal error:", error);
  process.exit(1);
});