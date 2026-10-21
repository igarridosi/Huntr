#!/usr/bin/env node
/**
 * DCF benchmark: runs the fixed universe through the dev route and writes a
 * report. Needs `npm run dev` on localhost:3000.
 *
 *   node scripts/dcf-benchmark.mjs                 # report only
 *   node scripts/dcf-benchmark.mjs --capture       # also freeze fixtures for the CI test
 *   node scripts/dcf-benchmark.mjs ONON NVO        # a subset
 *
 * Report: reports/dcf-benchmark/latest.md (+ .json). Fixtures:
 * src/lib/dcf/__tests__/fixtures/benchmark/<TICKER>.json, replayed by
 * src/lib/dcf/__tests__/benchmark.test.ts so a change cannot silently alter
 * how a company that passed is read.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const BASE = process.env.BENCHMARK_URL ?? "http://localhost:3000";
const args = process.argv.slice(2);
const capture = args.includes("--capture");
const universe = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/dcf-benchmark-tickers.json"), "utf8"));
const groups = Object.fromEntries(Object.entries(universe).filter(([k]) => !k.startsWith("_")));
const groupOf = Object.fromEntries(Object.entries(groups).flatMap(([g, ts]) => ts.map((t) => [t, g])));
const subset = args.filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase());
const tickers = subset.length ? subset : Object.values(groups).flat();

const CHUNK = 6;
const results = [];
let capturedAt = null;
for (let i = 0; i < tickers.length; i += CHUNK) {
  const chunk = tickers.slice(i, i + CHUNK);
  process.stdout.write(`${chunk.join(", ")} … `);
  const res = await fetch(`${BASE}/api/dev/dcf-benchmark?tickers=${chunk.join(",")}${capture ? "&raw=1" : ""}`);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = await res.json();
  results.push(...body.results);
  capturedAt ??= body.generatedAt;
  console.log(body.results.map((r) => `${r.result.ticker}:${r.result.verdict}`).join(" "));
}

const pct = (v, d = 1) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(d)}%`);
const big = (v) => (v === null || v === undefined ? "–" : Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : `${(v / 1e6).toFixed(0)}M`);
const count = (rs, v) => rs.filter((r) => r.result.verdict === v).length;
const foreign = (r) => groupOf[r.result.ticker] === "foreign_filers";
const line = (label, rs) =>
  `| ${label} | ${rs.length} | ${count(rs, "pass")} | ${count(rs, "warn")} | ${count(rs, "fail")} | ${rs.length ? pct((rs.length - count(rs, "fail")) / rs.length, 0) : "–"} |`;

const date = new Date().toISOString().slice(0, 10);
const md = [
  `# DCF benchmark — ${date}`,
  "",
  "Each company is read the way the DCF page reads it on Auto-Populate (`evaluateCompany`). **fail** = a figure that moves the value is wrong or missing; **warn** = data right, but the model fits poorly or a figure only came from a vendor; **pass** = every check the filings allow passed.",
  "",
  "| Group | N | pass | warn | fail | data OK |",
  "|---|---|---|---|---|---|",
  line("US filers", results.filter((r) => !foreign(r))),
  line("Foreign filers", results.filter(foreign)),
  line("**All**", results),
  "",
  "| Ticker | Group | Verdict | Shares (src, vs mkt cap) | Debt (src) | Cash (src) | SBC | Shift | Reliability (data/fit) | Regimes |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...results.map(({ result: r }) => {
    const s = r.summary;
    if (!s) return `| ${r.ticker} | ${groupOf[r.ticker] ?? "–"} | **${r.verdict}** | ${r.failures.join("; ")} | | | | | | |`;
    const rel = s.reliability ? `${s.reliability.score} ${s.reliability.grade} (${s.reliability.blocks.data}/${s.reliability.blocks.fit})` : "–";
    return `| ${r.ticker} | ${groupOf[r.ticker] ?? "–"} | **${r.verdict}** | ${s.shares.source}, ${pct(s.shares.impliedDeviation)} | ${big(s.debt.financial)} (${s.debt.source}) | ${big(s.cash.value)} (${s.cash.source}) | ${pct(s.adjustments.sbcPoints)} | ${pct(s.adjustments.marginShift)} | ${rel} | ${s.regimes.join(", ") || "–"} |`;
  }),
  "",
  "## Failures",
  "",
  ...results.filter((r) => r.result.failures.length).flatMap(({ result: r }) => [`- **${r.ticker}**`, ...r.failures.map((f) => `  - ${f}`)]),
  "",
  "## Warnings",
  "",
  ...results.filter((r) => r.result.warnings.length).flatMap(({ result: r }) => [`- **${r.ticker}**`, ...r.warnings.map((w) => `  - ${w}`)]),
  "",
].join("\n");

const outDir = path.join(ROOT, "reports/dcf-benchmark");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "latest.md"), md);
fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(results.map((r) => r.result), null, 1));

if (capture) {
  const fixtureDir = path.join(ROOT, "src/lib/dcf/__tests__/fixtures/benchmark");
  fs.mkdirSync(fixtureDir, { recursive: true });
  for (const r of results) {
    if (!r.raw) continue;
    fs.writeFileSync(path.join(fixtureDir, `${r.result.ticker}.json`), JSON.stringify({ capturedAt, raw: r.raw, expected: r.result }));
  }
}
console.log(`\n${count(results, "pass")} pass, ${count(results, "warn")} warn, ${count(results, "fail")} fail → reports/dcf-benchmark/latest.md`);
