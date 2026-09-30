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
