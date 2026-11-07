/**
 * The Azure Functions entry point: one timer function, `sec_ingest`.
 *
 * The schedule is the app setting SEC_INGEST_SCHEDULE (NCRONTAB, UTC, six
 * fields), 06:00 UTC by default in the infrastructure: EDGAR has published
 * the previous New York day by then. The function can be switched off
 * without a deploy with AzureWebJobs.sec_ingest.Disabled = true.
 *
 * useMonitor keeps the schedule's last and next occurrence in the host
 * storage, so a run missed while the app was stopped is made up once when
 * it starts again. A missed night costs nothing more: the cursor catches up.
 *
 * No retry policy, here or in host.json, on purpose. A failed invocation is
 * not run again: a whole run against EDGAR (and Postgres) repeated minutes
 * later would redo work the next night does anyway, and hammer the same
 * sources that may have caused the failure. Companies that failed are
 * already retried per company, the next night (see ingest.ts).
 *
 * Each invocation ends with one line the alert reads, run.ok or run.failed,
 * and then holds the instance for TELEMETRY_FLUSH_MS. Flex Consumption can
 * reclaim the instance as soon as the handler returns, and the host sends
 * telemetry in batches: on 2026-11-06 and 11-07 the runs succeeded (the
 * cursor moved) but their last ten seconds of logs, run.summary and the
 * invocation's own request record never reached Application Insights, so
 * the alert saw no success. The host's request record is written after the
 * handler returns and cannot be waited for; the line is.
 */

import { app, type InvocationContext, type Timer } from "@azure/functions";
import { runNightly } from "./function";
import type { Logger } from "./log";

/** Longer than the host's telemetry send interval (30 s by default). */
export const TELEMETRY_FLUSH_MS = 45_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The pipeline's JSON lines, through the context so they reach Application Insights with the invocation. */
function contextLogger(context: InvocationContext): Logger {
  return (level, msg, fields = {}) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
    if (level === "error") context.error(line);
    else if (level === "warn") context.warn(line);
    else context.info(line);
  };
}

/** The timer's handler; tests pass their own run and wait. */
export function nightlyHandler(run: typeof runNightly = runNightly, wait: (ms: number) => Promise<void> = sleep) {
  return async (timer: Timer, context: InvocationContext) => {
    const log = contextLogger(context);
    if (timer.isPastDue) log("warn", "timer.past-due", { note: "running a missed occurrence" });
    try {
      await run(process.env, log);
      log("info", "run.ok");
    } catch (error) {
      log("error", "run.failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      await wait(TELEMETRY_FLUSH_MS);
    }
  };
}

app.timer("sec_ingest", {
  schedule: "%SEC_INGEST_SCHEDULE%",
  runOnStartup: false,
  useMonitor: true,
  handler: nightlyHandler(),
});
