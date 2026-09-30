/**
 * The ingest as a command: what GitHub Actions runs, what the Azure
 * Function wraps, and what runs on a laptop to see what a night would do.
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
 * Configuration, from the environment:
 *   SEC_USER_AGENT                   required outside --dry-run
 *   SEC_INGEST_DATABASE_URL          the pooler URL, as huntr_sec_ingest (real run)
 *   SEC_INGEST_DATABASE_CA           PEM of the CA to verify the database's certificate (optional)
 *   SEC_INGEST_DATABASE_TLS=disable  local test bed only
 *   SEC_RAW_BLOB_ACCOUNT_URL         https://<account>.blob.core.windows.net, with the managed identity
 *   SEC_RAW_BLOB_CONNECTION_STRING   instead of the URL: Azurite ("UseDevelopmentStorage=true")
 *   SEC_RAW_BLOB_CONTAINER           default "sec-raw"
 *
 * Exit code 0 when the run is clean, 1 when it raised an alert (overdue
 * companies, many failures, stale cursor), 2 when it could not run.
 */

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { SEC_DEFAULT_USER_AGENT } from "../../../src/lib/sec/user-agent";
import { blobRaw, containerFor, type BlobTarget } from "./blob";
import { todayInNewYork } from "./daily-index";
import { diskFacts, diskRaw, diskState } from "./disk";
import { runIngest, type IngestDeps } from "./ingest";
import { jsonLogger, type Logger } from "./log";
import { activeTickers, connect, postgresFacts, postgresState, type Db } from "./postgres";
import { createSecClient, SecBlockedError } from "./sec-client";
import type { RawStore } from "./stores";

class ConfigError extends Error {}

function blobTarget(env: NodeJS.ProcessEnv): BlobTarget {
  const container = env.SEC_RAW_BLOB_CONTAINER?.trim() || "sec-raw";
  const connectionString = env.SEC_RAW_BLOB_CONNECTION_STRING?.trim();
  const accountUrl = env.SEC_RAW_BLOB_ACCOUNT_URL?.trim();
  if (connectionString) return { connectionString, container };
  if (accountUrl) return { accountUrl, container };
  throw new ConfigError("--raw blob needs SEC_RAW_BLOB_ACCOUNT_URL (Azure) or SEC_RAW_BLOB_CONNECTION_STRING (Azurite)");
}

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
  const env = process.env;
  const dryRun = values["dry-run"]!;
  const out = values.out!;
  let db: Db | null = null;

  try {
    // The real run must say who it is: the SEC writes to that address before
    // it blocks, and a default nobody chose would hide a lost setting.
    const userAgent = env.SEC_USER_AGENT?.trim() || null;
    if (!dryRun && !userAgent) throw new ConfigError('SEC_USER_AGENT is required outside --dry-run, e.g. "Huntr huntrvalue.me contact@huntrvalue.me"');
    if (!userAgent) log("warn", "config", { note: "SEC_USER_AGENT is not set; the dry run declares the default", userAgent: SEC_DEFAULT_USER_AGENT });

    const rawMode = values.raw ?? (dryRun ? "disk" : "blob");
    if (rawMode !== "disk" && rawMode !== "blob") throw new ConfigError("--raw must be disk or blob");

    const today = values.today ?? todayInNewYork();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new ConfigError("--today must be YYYY-MM-DD");
    const maxCompanies = values["max-companies"] ? Number(values["max-companies"]) : undefined;

    const raw: RawStore = rawMode === "blob" ? blobRaw(containerFor(blobTarget(env))) : diskRaw(out);

    let deps: Omit<IngestDeps, "client" | "log">;
    if (dryRun) {
      deps = { state: diskState(out), facts: diskFacts(out), raw };
    } else {
      const url = env.SEC_INGEST_DATABASE_URL?.trim();
      if (!url) throw new ConfigError("SEC_INGEST_DATABASE_URL is required outside --dry-run (the pooler URL, as huntr_sec_ingest)");
      const tls = env.SEC_INGEST_DATABASE_TLS === "disable" ? "disable" : { ca: env.SEC_INGEST_DATABASE_CA?.trim() || undefined };
      db = connect({ url, tls });
      deps = { state: postgresState(db), facts: postgresFacts(db), raw };
    }

    let tickers = [
      ...(values.tickers ?? "").split(","),
      ...(values["tickers-file"] ? (await readFile(values["tickers-file"], "utf8")).split(/\r?\n/) : []),
    ]
      .map((t) => t.trim())
      .filter(Boolean);
    if (tickers.length === 0 && db) tickers = await activeTickers(db);
    if (tickers.length === 0) throw new ConfigError(dryRun ? "pass --tickers AAPL,MSFT or --tickers-file path (one per line)" : "no active tickers in the database");

    log("info", "config", { mode: dryRun ? "dry-run" : "real", state: dryRun ? "disk" : "postgres", raw: rawMode });
    const summary = await runIngest({ ...deps, client: createSecClient({ userAgent: userAgent ?? SEC_DEFAULT_USER_AGENT }), log }, { tickers, today, maxCompanies });
    return summary.alerts.length > 0 ? 1 : 0;
  } catch (error) {
    report(log, error);
    return 2;
  } finally {
    if (db) await db.end({ timeout: 5 });
  }
}

function report(log: Logger, error: unknown) {
  if (error instanceof ConfigError) log("error", "config", { error: error.message });
  else log("error", "run.failed", { error: error instanceof Error ? error.message : String(error), blocked: error instanceof SecBlockedError });
}

main().then((code) => {
  process.exitCode = code;
});
