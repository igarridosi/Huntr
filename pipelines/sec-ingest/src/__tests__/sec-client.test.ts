import { describe, expect, it } from "vitest";
import { classifyResponse, createSecClient, SecBlockedError, SecHttpError } from "../sec-client";

type Reply = { status: number; type?: string; body?: string } | "network";

/** A fetch that answers from a script, and remembers what it was asked. */
function scripted(replies: Reply[]) {
  const calls: Array<{ url: string; ua: string | null }> = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, ua: new Headers(init?.headers).get("user-agent") });
    const r = replies.shift() ?? { status: 200, body: "{}" };
    if (r === "network") throw new TypeError("fetch failed");
    return new Response(r.body ?? "", { status: r.status, headers: { "content-type": r.type ?? "application/json" } });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function clock() {
  let t = 0;
  const waits: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      waits.push(ms);
      t += ms;
    },
    waits,
  };
}

describe("classifyResponse", () => {
  it("tells a missing file from a refused request, both 403", () => {
    expect(classifyResponse(403, "application/xml")).toBe("missing"); // S3 AccessDenied: no such index
    expect(classifyResponse(403, "text/html")).toBe("blocked"); // "Undeclared Automated Tool"
    expect(classifyResponse(404, null)).toBe("missing");
    expect(classifyResponse(429, null)).toBe("retry");
    expect(classifyResponse(503, null)).toBe("retry");
    expect(classifyResponse(400, null)).toBe("error");
    expect(classifyResponse(200, null)).toBe("ok");
  });
});

describe("createSecClient", () => {
  it("declares the User-Agent on every request", async () => {
    const { fetch, calls } = scripted([{ status: 200, body: "{}" }]);
    const c = clock();
    await createSecClient({ fetch, ...c, userAgent: "Test test@example.com" }).json("https://x/a");
    expect(calls[0].ua).toBe("Test test@example.com");
  });

  it("falls back to the shared default, a real contact address", async () => {
    const { fetch, calls } = scripted([{ status: 200, body: "{}" }]);
    const client = createSecClient({ fetch, ...clock() });
    await client.json("https://x/a");
    expect(client.userAgent).toBe("Huntr huntrvalue.me contact@huntrvalue.me");
    expect(calls[0].ua).toBe(client.userAgent);
  });

  it("spaces requests at least 125 ms apart", async () => {
    const { fetch } = scripted([]);
    const c = clock();
    const client = createSecClient({ fetch, ...c });
    for (let i = 0; i < 4; i++) await client.json(`https://x/${i}`);
    expect(c.waits).toEqual([125, 125, 125]);
    expect(client.requests).toBe(4);
  });

  it("retries a 503 and a network failure with backoff, then succeeds", async () => {
    const { fetch, calls } = scripted([{ status: 503 }, "network", { status: 200, body: '{"ok":true}' }]);
    const c = clock();
    const got = await createSecClient({ fetch, ...c }).json("https://x/a");
    expect(got).toEqual({ kind: "ok", value: { ok: true } });
    expect(calls).toHaveLength(3);
    expect(c.waits.filter((w) => w >= 1000)).toEqual([1000, 2000]);
  });

  it("returns a missing file without retrying", async () => {
    const { fetch, calls } = scripted([{ status: 403, type: "application/xml", body: "<Error><Code>AccessDenied</Code></Error>" }]);
    const got = await createSecClient({ fetch, ...clock() }).text("https://x/form.20260913.idx");
    expect(got).toEqual({ kind: "missing", status: 403 });
    expect(calls).toHaveLength(1);
  });

  it("stops at once when EDGAR refuses the request", async () => {
    const { fetch, calls } = scripted([{ status: 403, type: "text/html", body: "Undeclared Automated Tool" }]);
    await expect(createSecClient({ fetch, ...clock() }).json("https://x/a")).rejects.toBeInstanceOf(SecBlockedError);
    expect(calls).toHaveLength(1);
  });

  it("treats a 429 that outlasts the backoff as a block, and a lasting 5xx as an error", async () => {
    await expect(createSecClient({ fetch: scripted(Array(4).fill({ status: 429 })).fetch, ...clock() }).json("https://x/a")).rejects.toBeInstanceOf(SecBlockedError);
    await expect(createSecClient({ fetch: scripted(Array(4).fill({ status: 502 })).fetch, ...clock() }).json("https://x/a")).rejects.toBeInstanceOf(SecHttpError);
  });
});
