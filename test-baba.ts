
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();

async function run() {
  try {
    const raw = await yahooFinance.quoteSummary("BABA", { modules: ["earningsHistory", "earningsTrend"] });
    console.log("YAHOO HISTORY:", JSON.stringify(raw.earningsHistory?.history, null, 2));
    console.log("YAHOO TREND:", JSON.stringify(raw.earningsTrend?.trend?.map(t => ({ p: t.period, e: t.earningsEstimate?.avg })), null, 2));
  } catch (err) {
    console.log("YAHOO ERR:", err.message);
  }
}
run();

