/**
 * One nightly run inside Azure Functions, independent of the Functions
 * runtime so it can be tested: azure.ts only registers it.
 *
 * SEC_INGEST_MODE decides where it writes:
 *   blob-only  raw payloads to Blob Storage; state and facts to the
 *              instance's temporary disk, which does not survive the run.
 *              Postgres is not touched. The universe is SEC_INGEST_TICKERS.
 *              The first stage in the cloud: EDGAR from Azure, Blob with the
 *              managed identity, logs and the alert, without the database.
 *   real       state and facts to Postgres, raw payloads to Blob Storage.
 *              The universe is `tickers`, or SEC_INGEST_TICKERS if set.
 *
 * A run that raises alerts, or cannot run, throws: the invocation fails,
 * which is what Application Insights records and the alert watches.
 */

import { tmpdir } from "node:os";
import path from "node:path";
import { ConfigError, parseTickers, setupRun, type RunTarget } from "./config";
import { todayInNewYork } from "./daily-index";
import { runIngest, type IngestSummary } from "./ingest";
import type { Logger } from "./log";

export type FunctionMode = "blob-only" | "real";

export function targetFor(env: NodeJS.ProcessEnv): RunTarget {
  const mode = env.SEC_INGEST_MODE?.trim();
  if (mode !== "blob-only" && mode !== "real") throw new ConfigError('SEC_INGEST_MODE must be "blob-only" or "real"');
  const tickers = parseTickers(env.SEC_INGEST_TICKERS);
  if (mode === "blob-only" && tickers.length === 0) throw new ConfigError("blob-only needs SEC_INGEST_TICKERS: without Postgres there is no tickers table to read");
  return { store: mode === "blob-only" ? "disk" : "postgres", raw: "blob", out: path.join(tmpdir(), "sec-ingest"), tickers };
}

/** Raised when the run completed but its alerts need a person: fails the invocation. */
export class IngestAlertError extends Error {
  constructor(readonly summary: IngestSummary) {
    super(`sec-ingest raised ${summary.alerts.length} alert(s): ${summary.alerts.join("; ")}`);
    this.name = "IngestAlertError";
  }
}

export async function runNightly(
  env: NodeJS.ProcessEnv,
  log: Logger,
  now: () => Date = () => new Date(),
  /** Tests pass their own; the function uses the real one. */
  makeSetup: typeof setupRun = setupRun
): Promise<IngestSummary> {
  const setup = await makeSetup(targetFor(env), env, log);
  try {
    const summary = await runIngest(setup.deps, { tickers: setup.tickers, today: todayInNewYork(now()), now });
    if (summary.alerts.length > 0) throw new IngestAlertError(summary);
    return summary;
  } finally {
    await setup.close();
  }
}
