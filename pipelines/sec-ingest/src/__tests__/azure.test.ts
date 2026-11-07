import { describe, expect, it, vi } from "vitest";

// What azure.ts hands to @azure/functions when it registers the timer.
const registered: Array<{ name: string; options: Record<string, unknown> }> = [];
vi.mock("@azure/functions", () => ({
  app: { timer: (name: string, options: Record<string, unknown>) => registered.push({ name, options }) },
}));

describe("the sec_ingest timer", () => {
  it("is registered once, on the configurable schedule, with no retry policy", async () => {
    await import("../azure");
    expect(registered.map((r) => r.name)).toEqual(["sec_ingest"]);
    const { options } = registered[0];
    expect(options).toMatchObject({ schedule: "%SEC_INGEST_SCHEDULE%", runOnStartup: false, useMonitor: true });
    // A failed run must not be rerun against EDGAR and Postgres minutes later.
    expect(options).not.toHaveProperty("retry");
  });

  it("has no retry policy in host.json either", async () => {
    const { readFileSync } = await import("node:fs");
    const host = JSON.parse(readFileSync(new URL("../../host.json", import.meta.url), "utf8"));
    expect(host).not.toHaveProperty("retry");
    expect(JSON.stringify(host)).not.toMatch(/retry/i);
  });
});

describe("the sec_ingest handler", () => {
  const context = () => {
    const lines: Array<{ level: string; msg: string; error?: string }> = [];
    const push = (level: string) => (line: string) => lines.push({ level, ...JSON.parse(line) });
    return { lines, ctx: { info: push("info"), warn: push("warn"), error: push("error") } as never };
  };
  const timer = { isPastDue: false } as never;

  it("ends a good run with run.ok, then holds the instance so the line is sent", async () => {
    const { nightlyHandler, TELEMETRY_FLUSH_MS } = await import("../azure");
    const { lines, ctx } = context();
    const waits: number[] = [];
    const run = vi.fn(async (_env: NodeJS.ProcessEnv, log: (l: "info", m: string) => void) => {
      log("info", "run.summary");
      return {} as never;
    });
    await nightlyHandler(run as never, async (ms) => void waits.push(ms))(timer, ctx);
    expect(lines.map((l) => l.msg)).toEqual(["run.summary", "run.ok"]);
    expect(waits).toEqual([TELEMETRY_FLUSH_MS]);
  });

  it("ends a failed run with run.failed and still fails the invocation, after the same wait", async () => {
    const { nightlyHandler, TELEMETRY_FLUSH_MS } = await import("../azure");
    const { lines, ctx } = context();
    const waits: number[] = [];
    const run = vi.fn(async () => {
      throw new Error("sec-ingest raised 1 alert(s)");
    });
    await expect(nightlyHandler(run as never, async (ms) => void waits.push(ms))(timer, ctx)).rejects.toThrow("raised 1 alert");
    expect(lines).toEqual([expect.objectContaining({ level: "error", msg: "run.failed", error: "sec-ingest raised 1 alert(s)" })]);
    expect(waits).toEqual([TELEMETRY_FLUSH_MS]);
  });
});
