/**
 * The ingest as a command: what GitHub Actions runs, and what runs on a
 * laptop to see what a night would do. The Azure Function (azure.ts) runs
 * the same setup and the same ingest.
 *
 *   node dist/cli.mjs --dry-run --tickers AAPL,GOOG,GOOGL,V --out ./out
 *   node dist/cli.mjs --dry-run --raw blob --tickers-file tickers.txt
 *   node dist/cli.mjs                        # the real run
 *
 * --dry-run   state and facts go to --out on disk; Postgres is not touched.
 *             Raw payloads go to disk too, or to Blob Storage with --raw blob.
 * (default)   state and facts go to Postgres, raw payloads to Blob Storage
 *             (or to disk with --raw disk). The universe is the active rows
 *             of `tickers` unless --tickers/--tickers-file is given.
 *
 * Configuration comes from the environment: see config.ts.
 *
 * Exit code 0 when the run is clean, 1 when it raised an alert (overdue
 * companies, many failures, stale cursor), 2 when it could not run.
 */

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ConfigError, parseTickers, setupRun, type RunSetup } from "./config";
import { todayInNewYork } from "./daily-index";
import { runIngest } from "./ingest";
import { jsonLogger, type Logger } from "./log";
import { SecBlockedError } from "./sec-client";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      raw: { type: "string" },
      out: { type: "string", default: "./out" },
      tickers: { type: "string" },
      "tickers-file": { type: "string" },
      "max-companies": { type: "string" },
      today: { type: "string" },
    },
  });
  const log = jsonLogger();
  const dryRun = values["dry-run"]!;
  let setup: RunSetup | null = null;

  try {
    const raw = values.raw ?? (dryRun ? "disk" : "blob");
    if (raw !== "disk" && raw !== "blob") throw new ConfigError("--raw must be disk or blob");
    const today = values.today ?? todayInNewYork();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new ConfigError("--today must be YYYY-MM-DD");
    const maxCompanies = values["max-companies"] ? Number(values["max-companies"]) : undefined;
    const tickers = [...parseTickers(values.tickers), ...(values["tickers-file"] ? parseTickers(await readFile(values["tickers-file"], "utf8")) : [])];
    if (dryRun && tickers.length === 0) throw new ConfigError("pass --tickers AAPL,MSFT or --tickers-file path (one per line)");

    setup = await setupRun({ store: dryRun ? "disk" : "postgres", raw, out: values.out!, tickers }, process.env, log);
    const summary = await runIngest(setup.deps, { tickers: setup.tickers, today, maxCompanies });
    return summary.alerts.length > 0 ? 1 : 0;
  } catch (error) {
    report(log, error);
    return 2;
  } finally {
    await setup?.close();
  }
}

function report(log: Logger, error: unknown) {
  if (error instanceof ConfigError) log("error", "config", { error: error.message });
  else log("error", "run.failed", { error: error instanceof Error ? error.message : String(error), blocked: error instanceof SecBlockedError });
}

main().then((code) => {
  process.exitCode = code;
});
