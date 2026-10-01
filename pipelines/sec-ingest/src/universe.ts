/**
 * The companies to ingest: the app's tickers, resolved to CIKs through
 * EDGAR's own ticker file and deduplicated - GOOG and GOOGL are one
 * company and one download.
 */

export const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

export interface Company {
  cik: number;
  /**
   * One of its tickers, for the logs and sec_ingest_state: the one EDGAR
   * lists first for the CIK, which is its main listing (CMCSA, not the
   * CCZ notes; T, not the TBB notes), and alphabetical between tickers
   * EDGAR does not rank.
   */
  ticker: string;
  tickers: string[];
}

export interface Universe {
  companies: Company[];
  /** Tickers EDGAR does not know: see "Tickers EDGAR does not resolve" in the README. */
  unresolved: string[];
}

/**
 * EDGAR writes a share class with a hyphen (BRK-B); other sources write it
 * with a dot or a slash (BRK.B, BRK/B). Only tried when the ticker as given
 * is unknown.
 */
function edgarSpelling(ticker: string): string {
  return ticker.replace(/[./]/g, "-");
}

export function buildUniverse(tickers: string[], secTickers: unknown): Universe {
  // EDGAR's file is ordered: within a CIK, the main listing comes first.
  const known = new Map<string, { cik: number; rank: number }>();
  let rank = 0;
  for (const entry of Object.values((secTickers ?? {}) as Record<string, { ticker?: string; cik_str?: number | string }>)) {
    rank++;
    if (!entry?.ticker || entry.cik_str === undefined) continue;
    const cik = Number(entry.cik_str);
    const key = String(entry.ticker).toUpperCase();
    if (Number.isInteger(cik) && cik > 0 && !known.has(key)) known.set(key, { cik, rank });
  }

  const byCik = new Map<number, { ticker: string; rank: number }[]>();
  const unresolved: string[] = [];
  for (const raw of new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))) {
    const hit = known.get(raw) ?? known.get(edgarSpelling(raw));
    if (hit === undefined) unresolved.push(raw);
    else byCik.set(hit.cik, [...(byCik.get(hit.cik) ?? []), { ticker: raw, rank: hit.rank }]);
  }

  const companies = [...byCik.entries()]
    .map(([cik, list]) => {
      const main = [...list].sort((a, b) => a.rank - b.rank || a.ticker.localeCompare(b.ticker))[0];
      return { cik, ticker: main.ticker, tickers: list.map((t) => t.ticker).sort() };
    })
    .sort((a, b) => a.cik - b.cik);
  return { companies, unresolved: unresolved.sort() };
}

export function cik10(cik: number): string {
  return String(cik).padStart(10, "0");
}
