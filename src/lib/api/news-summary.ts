/**
 * The short summary in the Insights news preview: the article's own
 * description (og:description), the teaser its publisher writes for link
 * previews. Never the article's text.
 *
 * Only a story already in our news cache is read, and only from
 * finance.yahoo.com, where every link Yahoo's news search returns points:
 * the server never fetches a URL a client chose. Cached per story for a
 * week, since an article's description does not change.
 */

import "server-only";
import { getSymbolNews } from "@/lib/api/yahoo";
import { getCachedData, setCachedData, withSingleFlight } from "@/lib/api/cache";
import { extractDescription } from "@/lib/market-news";

const ALLOWED_HOST = "finance.yahoo.com";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;
/** The description is in <head>; the rest of a ~1 MB page is never read. */
const MAX_BYTES = 512 * 1024;

interface CachedSummary {
  fetchedAt: string;
  summary: string | null;
}

async function readHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  try {
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return html;
}

/**
 * The summary of story `id` from `symbol`'s news: null when it has none,
 * undefined when it could not be read this time (not cached, worth a retry).
 */
export async function getNewsSummary(symbol: string, id: string): Promise<string | null | undefined> {
  const item = (await getSymbolNews(symbol)).find((n) => n.id === id);
  if (!item) return null;

  let url: URL;
  try {
    url = new URL(item.link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.host !== ALLOWED_HOST) return null;

  const cacheTicker = `NEWS:${id}`.slice(0, 120);
  const cached = await getCachedData<CachedSummary>(cacheTicker, "summary-v1", TTL_MS);
  if (cached && "summary" in cached) return cached.summary;

  return withSingleFlight(`${cacheTicker}:summary`, async (): Promise<string | null | undefined> => {
    let summary: string | null = null;
    try {
      // No redirects followed: a page that moves elsewhere is not read.
      // The agent says "HuntrBot": sent as "Huntr/1.0", Yahoo answered with
      // headers past Node's 16 KB limit and every fetch failed.
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; HuntrBot/1.0; +https://huntrvalue.me)", accept: "text/html" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) {
        summary = extractDescription(await readHead(res));
      }
    } catch (error) {
      console.error(`[news-summary] ${id} failed:`, error);
      return undefined; // not cached: worth another try later
    }
    await setCachedData(cacheTicker, "summary-v1", { fetchedAt: new Date().toISOString(), summary } satisfies CachedSummary);
    return summary;
  });
}
