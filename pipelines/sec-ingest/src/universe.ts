/**
 * The companies to ingest: the app's tickers, resolved to CIKs through
 * EDGAR's own ticker file and deduplicated - GOOG and GOOGL are one
 * company and one download.
 */

export const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

export interface Company {
  cik: number;
  /** One of its tickers, for the logs: the first alphabetically. */
  ticker: string;
  tickers: string[];
}

export interface Universe {
  companies: Company[];
  /** Tickers EDGAR does not know: foreign issuers without SEC filings, ETFs, typos. */
  unresolved: string[];
}

export function buildUniverse(tickers: string[], secTickers: unknown): Universe {
  const cikOf = new Map<string, number>();
  for (const entry of Object.values((secTickers ?? {}) as Record<string, { ticker?: string; cik_str?: number | string }>)) {
    if (!entry?.ticker || entry.cik_str === undefined) continue;
    const cik = Number(entry.cik_str);
    if (Number.isInteger(cik) && cik > 0) cikOf.set(String(entry.ticker).toUpperCase(), cik);
  }

  const byCik = new Map<number, string[]>();
  const unresolved: string[] = [];
  for (const raw of new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))) {
    const cik = cikOf.get(raw);
    if (cik === undefined) unresolved.push(raw);
    else byCik.set(cik, [...(byCik.get(cik) ?? []), raw]);
  }

  const companies = [...byCik.entries()]
    .map(([cik, list]) => {
      const sorted = [...list].sort();
      return { cik, ticker: sorted[0], tickers: sorted };
    })
    .sort((a, b) => a.cik - b.cik);
  return { companies, unresolved: unresolved.sort() };
}

export function cik10(cik: number): string {
  return String(cik).padStart(10, "0");
}
