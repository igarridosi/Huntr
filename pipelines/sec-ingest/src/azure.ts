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
 */

import { app, type InvocationContext, type Timer } from "@azure/functions";
import { runNightly } from "./function";
import type { Logger } from "./log";

/** The pipeline's JSON lines, through the context so they reach Application Insights with the invocation. */
function contextLogger(context: InvocationContext): Logger {
  return (level, msg, fields = {}) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
    if (level === "error") context.error(line);
    else if (level === "warn") context.warn(line);
    else context.info(line);
  };
}

app.timer("sec_ingest", {
  schedule: "%SEC_INGEST_SCHEDULE%",
  runOnStartup: false,
  useMonitor: true,
  handler: async (timer: Timer, context: InvocationContext) => {
    if (timer.isPastDue) context.warn(JSON.stringify({ level: "warn", msg: "timer.past-due", note: "running a missed occurrence" }));
    await runNightly(process.env, contextLogger(context));
  },
});
