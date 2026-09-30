/**
 * EDGAR over HTTP, within the SEC's fair-access policy: a declared
 * User-Agent, at most 8 requests a second (the limit is 10), retries with
 * backoff on 429 and 5xx.
 *
 * EDGAR's archive sits on S3, and a file that does not exist answers 403
 * with an XML AccessDenied body, not 404 - that is what a weekend's daily
 * index returns. A request EDGAR refuses (no User-Agent, too fast) is also
 * a 403, with an HTML page. The two are told apart by content type: the
 * first is "nothing there", the second must stop the run and raise the
 * alarm, and confusing them either hides a block or pages on every Sunday.
 */

import { SEC_DEFAULT_USER_AGENT } from "../../../src/lib/sec/user-agent";

/** 8 a second: under the SEC's 10, with room for the app's own requests. */
export const MIN_INTERVAL_MS = 125;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

export type SecResult<T> = { kind: "ok"; value: T } | { kind: "missing"; status: number };

/** EDGAR refused the request itself. Never retried past the backoff; the run stops. */
export class SecBlockedError extends Error {
  constructor(
    readonly url: string,
    readonly status: number
  ) {
    super(`EDGAR refused ${url} (${status}): check the User-Agent and the request rate`);
    this.name = "SecBlockedError";
  }
}

export class SecHttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number
  ) {
    super(`EDGAR answered ${status} for ${url}`);
    this.name = "SecHttpError";
  }
}

export type ResponseClass = "ok" | "missing" | "blocked" | "retry" | "error";

export function classifyResponse(status: number, contentType: string | null): ResponseClass {
  if (status >= 200 && status < 300) return "ok";
  if (status === 404) return "missing";
  if (status === 403) return /xml/i.test(contentType ?? "") ? "missing" : "blocked";
  if (status === 429 || status >= 500) return "retry";
  return "error";
}

export interface SecClientOptions {
  userAgent?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minIntervalMs?: number;
}

export interface SecClient {
  json<T = unknown>(url: string): Promise<SecResult<T>>;
  text(url: string): Promise<SecResult<string>>;
  /** Raw bytes, for keeping the payload exactly as EDGAR sent it. */
  bytes(url: string): Promise<SecResult<Buffer>>;
  /** Requests sent, retries included. */
  readonly requests: number;
  /** What every request declares. */
  readonly userAgent: string;
}

export function createSecClient(options: SecClientOptions = {}): SecClient {
  const userAgent = options.userAgent?.trim() || SEC_DEFAULT_USER_AGENT;
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const interval = options.minIntervalMs ?? MIN_INTERVAL_MS;
  let nextSlot = 0;
  let requests = 0;

  /** Spaces request starts at least `interval` apart, whoever calls. */
  async function slot(): Promise<void> {
    const t = now();
    const wait = Math.max(0, nextSlot - t);
    nextSlot = Math.max(t, nextSlot) + interval;
    if (wait > 0) await sleep(wait);
  }

  async function get(url: string): Promise<SecResult<Response>> {
    for (let attempt = 0; ; attempt++) {
      await slot();
      requests++;
      let response: Response | null = null;
      try {
        response = await doFetch(url, { headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip, deflate" } });
      } catch {
        response = null; // network failure: retried like a 5xx
      }
      const cls = response ? classifyResponse(response.status, response.headers.get("content-type")) : "retry";
      if (cls === "ok") return { kind: "ok", value: response! };
      if (cls === "missing") return { kind: "missing", status: response!.status };
      if (cls === "blocked") throw new SecBlockedError(url, response!.status);
      if (cls === "error") throw new SecHttpError(url, response!.status);
      if (attempt >= RETRY_DELAYS_MS.length) {
        if (response?.status === 429) throw new SecBlockedError(url, 429);
        throw new SecHttpError(url, response?.status ?? 0);
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  const map = async <T>(url: string, read: (r: Response) => Promise<T>): Promise<SecResult<T>> => {
    const got = await get(url);
    return got.kind === "ok" ? { kind: "ok", value: await read(got.value) } : got;
  };

  return {
    json: <T>(url: string) => map(url, (r) => r.json() as Promise<T>),
    text: (url: string) => map(url, (r) => r.text()),
    bytes: (url: string) => map(url, async (r) => Buffer.from(await r.arrayBuffer())),
    get requests() {
      return requests;
    },
    userAgent,
  };
}
