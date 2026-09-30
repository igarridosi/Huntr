/**
 * The ingest as a command: what GitHub Actions runs, and what runs on a
 * laptop to see what a night would do.
 *
 *   node dist/cli.mjs --dry-run --tickers AAPL,GOOG,GOOGL,V --out ./out
 *   node dist/cli.mjs --dry-run --tickers-file tickers.txt --max-companies 20
 *
 * Only --dry-run exists for now: it writes to --out instead of Postgres
 * and Blob Storage. Outside the dry run SEC_USER_AGENT is required.
 *
 * Exit code 0 when the run is clean, 1 when it raised an alert (overdue
 * companies, many failures, stale cursor), 2 when it could not run.
 */

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { todayInNewYork } from "./daily-index";
import { diskFacts, diskRaw, diskState } from "./disk";
import { runIngest } from "./ingest";
import { SEC_DEFAULT_USER_AGENT } from "../../../src/lib/sec/user-agent";
import { jsonLogger } from "./log";
import { createSecClient, SecBlockedError } from "./sec-client";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      out: { type: "string", default: "./out" },
      tickers: { type: "string" },
      "tickers-file": { type: "string" },
      "max-companies": { type: "string" },
      today: { type: "string" },
    },
  });
  const log = jsonLogger();

  // The real run must say who it is: the SEC writes to that address before
  // it blocks, and a default nobody chose would hide a lost setting.
  const userAgent = process.env.SEC_USER_AGENT?.trim() || null;
  if (!values["dry-run"]) {
    if (!userAgent) {
      log("error", "config", { error: "SEC_USER_AGENT is required outside --dry-run, e.g. \"Huntr huntrvalue.me contact@huntrvalue.me\"" });
      return 2;
    }
    log("error", "usage", { error: "only --dry-run is implemented; the Postgres and Blob writers come in the next PR" });
    return 2;
  }
  if (!userAgent) log("warn", "config", { note: "SEC_USER_AGENT is not set; the dry run declares the default", userAgent: SEC_DEFAULT_USER_AGENT });

  const tickers = [
    ...(values.tickers ?? "").split(","),
    ...(values["tickers-file"] ? (await readFile(values["tickers-file"], "utf8")).split(/\r?\n/) : []),
  ]
    .map((t) => t.trim())
    .filter(Boolean);
  if (tickers.length === 0) {
    log("error", "usage", { error: "pass --tickers AAPL,MSFT or --tickers-file path (one per line)" });
    return 2;
  }

  const today = values.today ?? todayInNewYork();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    log("error", "usage", { error: "--today must be YYYY-MM-DD" });
    return 2;
  }
  const maxCompanies = values["max-companies"] ? Number(values["max-companies"]) : undefined;

  const out = values.out!;
  try {
    const summary = await runIngest(
      {
        client: createSecClient({ userAgent: userAgent ?? SEC_DEFAULT_USER_AGENT }),
        state: diskState(out),
        facts: diskFacts(out),
        raw: diskRaw(out),
        log,
      },
      { tickers, today, maxCompanies }
    );
    return summary.alerts.length > 0 ? 1 : 0;
  } catch (error) {
    log("error", "run.failed", { error: error instanceof Error ? error.message : String(error), blocked: error instanceof SecBlockedError });
    return 2;
  }
}

main().then((code) => {
  process.exitCode = code;
});
