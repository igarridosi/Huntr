/**
 * SEC EDGAR — multi-class issuers: the diluted count from the filing itself.
 */

import type { SECFact } from "./facts";

export const DILUTED_SHARES_TAG = "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding";
/** Berkshire has nothing dilutive and files the basic count only; it is the same count. */
export const BASIC_SHARES_TAG = "us-gaap:WeightedAverageNumberOfSharesOutstandingBasic";

/**
 * The diluted share count of an issuer with several classes of stock,
 * read off its latest 10-Q or 10-K.
 *
 * Visa, Berkshire, Alphabet's cousins with two tickers: they report
 * earnings per share by class, so every share count in the filing is
 * tagged with a class dimension, and the SEC's companyfacts feed — which
 * carries undimensioned facts only — has no share count for them at all.
 * The model then fell back to the cover-page count, which for Visa is
 * class A alone: 1.70B against a share base of 1.88B, and every per-share
 * figure 10% too high.
 *
 * The filing's inline XBRL has the facts with their contexts. The count
 * taken is the largest diluted count of the latest period, which is the
 * "as-converted" or "equivalent" basis a multi-class issuer reports its
 * EPS on (Visa's class A with B and C converted in; Berkshire's class B
 * equivalents — basic, since Berkshire has nothing dilutive and files no
 * diluted count). Only consulted when no undimensioned count exists.
 */
export function parseClassDilutedShares(
  html: string,
  meta: { form: string; filed: string }
): SECFact | null {
  const contexts = new Map<string, { start: string | null; end: string | null; members: string[] }>();
  for (const m of html.matchAll(/<(?:xbrli:)?context id="([^"]+)">([\s\S]*?)<\/(?:xbrli:)?context>/g)) {
    const body = m[2];
    contexts.set(m[1], {
      start: /<(?:xbrli:)?startDate>([^<]+)</.exec(body)?.[1] ?? null,
      end: /<(?:xbrli:)?endDate>([^<]+)</.exec(body)?.[1] ?? null,
      members: [...body.matchAll(/<xbrldi:explicitMember dimension="([^"]+)">([^<]+)</g)].map((d) => `${d[1]}=${d[2]}`),
    });
  }

  type Candidate = { value: number; start: string; end: string; days: number; tag: string };
  const all: Candidate[] = [];
  for (const m of html.matchAll(/<ix:nonFraction([^>]*)>([^<]*)</g)) {
    const attrs = m[1];
    const tag = [DILUTED_SHARES_TAG, BASIC_SHARES_TAG].find((t) => attrs.includes(`name="${t}"`));
    if (!tag) continue;
    const ref = /contextRef="([^"]+)"/.exec(attrs)?.[1];
    const ctx = ref ? contexts.get(ref) : undefined;
    if (!ctx || !ctx.start || !ctx.end) continue;
    // One dimension, and it is the class of stock: nothing else sliced in.
    if (ctx.members.length !== 1 || !ctx.members[0].startsWith("us-gaap:StatementClassOfStockAxis=")) continue;
    const scale = Number(/scale="(-?\d+)"/.exec(attrs)?.[1] ?? "0");
    const raw = Number(m[2].replace(/[,\s]/g, ""));
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const value = raw * Math.pow(10, scale);
    const days = Math.round((Date.parse(ctx.end) - Date.parse(ctx.start)) / 86_400_000);
    all.push({ value, start: ctx.start, end: ctx.end, days, tag });
  }
  const diluted = all.filter((c) => c.tag === DILUTED_SHARES_TAG);
  const candidates = diluted.length > 0 ? diluted : all;
  if (candidates.length === 0) return null;

  // Latest period end; among those, the shortest span (the quarter of a
  // 10-Q rather than its year-to-date column); then the largest class.
  const latestEnd = candidates.reduce((a, c) => (c.end > a ? c.end : a), "");
  const latest = candidates.filter((c) => c.end === latestEnd);
  const shortest = Math.min(...latest.map((c) => c.days));
  const pick = latest.filter((c) => c.days === shortest).reduce((a, c) => (c.value > a.value ? c : a));
  return {
    value: pick.value,
    form: meta.form,
    filed: meta.filed,
    periodEnd: pick.end,
    concept: `${pick.tag.slice("us-gaap:".length)} (by class, largest as-converted)`,
    durationDays: pick.days,
  };
}
