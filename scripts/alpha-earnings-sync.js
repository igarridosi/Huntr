/* eslint-disable no-console */
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config({ path: ".env.local" });

const BASE_URL = "https://www.alphavantage.co/query";
const CACHE_KEY = "earnings-alpha-v1";
const DAILY_LIMIT = 12;
const MIN_INTERVAL_MS = 13_000;

const apiKey = process.env.ALPHAVANTAGE_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!apiKey || !supabaseUrl || !supabaseKey) {
  console.error("Missing ALPHAVANTAGE_API_KEY or Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function quarterLabelFromDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
}

async function fetchAlpha(params) {
  const url = `${BASE_URL}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AlphaVantage ${params.function} failed: ${response.status} ${body}`);
  }
  return response.text();
}

function parseCsv(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

async function getEarningsCalendar() {
  const text = await fetchAlpha({
    function: "EARNINGS_CALENDAR",
    apikey: apiKey,
  });

  const rows = parseCsv(text);
  const calendar = new Map();

  for (const row of rows) {
    const symbol = (row.symbol || row.ticker || "").toUpperCase();
    if (!symbol) continue;
    const reportDate = row.reportDate || row.report_date || null;
    const fiscalDate = row.fiscalDateEnding || row.fiscal_date_ending || null;
    const estimate = toNumber(row.estimate);

    if (!calendar.has(symbol)) {
      calendar.set(symbol, { reportDate, fiscalDate, estimate });
    }
  }

  return calendar;
}

async function getEarningsRows(symbol) {
  const text = await fetchAlpha({
    function: "EARNINGS",
    symbol,
    apikey: apiKey,
  });

  const payload = JSON.parse(text);
  const rows = Array.isArray(payload.quarterlyEarnings)
    ? payload.quarterlyEarnings
    : [];

  return rows.slice(0, 16);
}

async function getIncomeRows(symbol) {
  const text = await fetchAlpha({
    function: "INCOME_STATEMENT",
    symbol,
    apikey: apiKey,
  });

  const payload = JSON.parse(text);
  const rows = Array.isArray(payload.quarterlyReports)
    ? payload.quarterlyReports
    : [];

  return rows.slice(0, 16);
}

function mergeRows(earnings, income) {
  const incomeByDate = new Map();
  for (const row of income) {
    const fiscalDate = row.fiscalDateEnding;
    if (fiscalDate) {
      incomeByDate.set(fiscalDate, row);
    }
  }

  return earnings.map((row) => {
    const fiscalDate = row.fiscalDateEnding;
    const incomeRow = incomeByDate.get(fiscalDate) || {};

    return {
      fiscal_date: fiscalDate,
      report_date: row.reportedDate || null,
      quarter: fiscalDate ? quarterLabelFromDate(fiscalDate) : "Unknown",
      eps_actual: toNumber(row.reportedEPS),
      eps_estimate: toNumber(row.estimatedEPS),
      revenue_actual: toNumber(incomeRow.totalRevenue),
      revenue_estimate: null,
    };
  });
}

async function upsertCache(symbol, rows, nextEstimate) {
  const payload = {
    ticker: symbol,
    rows,
    next_estimate: nextEstimate ?? null,
    fetched_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("stock_cache").upsert(
    {
      ticker: symbol,
      cache_key: CACHE_KEY,
      data: payload,
      last_updated: new Date().toISOString(),
    },
    { onConflict: "ticker,cache_key" }
  );

  if (error) {
    throw new Error(`Supabase upsert failed for ${symbol}: ${error.message}`);
  }
}

async function getTickers(limit) {
  const { data, error } = await supabase
    .from("tickers")
    .select("symbol")
    .eq("is_active", true)
    .order("symbol")
    .limit(limit);

  if (error || !data) {
    throw new Error(`Failed to read tickers: ${error?.message || "unknown"}`);
  }

  return data.map((row) => row.symbol.toUpperCase());
}

async function main() {
  const args = process.argv.slice(2);
  const tickersArgIndex = args.indexOf("--tickers");
  const limitArgIndex = args.indexOf("--limit");

  const tickers =
    tickersArgIndex !== -1
      ? args[tickersArgIndex + 1].split(",").map((t) => t.trim().toUpperCase())
      : await getTickers(DAILY_LIMIT);

  const limit = limitArgIndex !== -1 ? Number(args[limitArgIndex + 1]) : tickers.length;
  const symbols = tickers.slice(0, Number.isFinite(limit) ? limit : tickers.length);

  console.log(`Syncing ${symbols.length} tickers using Alpha Vantage...`);

  const calendar = await getEarningsCalendar();
  let requestCount = 1;

  for (const symbol of symbols) {
    console.log(`Fetching ${symbol}...`);
    const earnings = await getEarningsRows(symbol);
    requestCount += 1;
    await sleep(MIN_INTERVAL_MS);

    const income = await getIncomeRows(symbol);
    requestCount += 1;
    await sleep(MIN_INTERVAL_MS);

    const merged = mergeRows(earnings, income);

    const calendarEntry = calendar.get(symbol);
    const nextEstimate = calendarEntry && calendarEntry.fiscalDate
      ? {
          fiscal_date: calendarEntry.fiscalDate,
          report_date: calendarEntry.reportDate || null,
          quarter: quarterLabelFromDate(calendarEntry.fiscalDate),
          eps_actual: null,
          eps_estimate: calendarEntry.estimate ?? null,
          revenue_actual: null,
          revenue_estimate: null,
        }
      : null;

    await upsertCache(symbol, merged, nextEstimate);
  }

  console.log(`Done. Requests used: ${requestCount}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
