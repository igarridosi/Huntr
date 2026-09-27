/** Sector names, shared by the server cache reader and the screener. */

/** Yahoo's sector names (and stray ones in the tickers table) onto the eleven GICS sectors. */
const GICS: Record<string, string> = {
  technology: "Information Technology",
  "information technology": "Information Technology",
  "consumer cyclical": "Consumer Discretionary",
  "consumer discretionary": "Consumer Discretionary",
  "consumer defensive": "Consumer Staples",
  "consumer staples": "Consumer Staples",
  "financial services": "Financials",
  financials: "Financials",
  financial: "Financials",
  healthcare: "Health Care",
  "health care": "Health Care",
  "basic materials": "Materials",
  materials: "Materials",
  "communication services": "Communication Services",
  "real estate": "Real Estate",
  utilities: "Utilities",
  energy: "Energy",
  industrials: "Industrials",
};

/** A GICS sector name, or null for anything that is not one ("Unknown", "Inc."). */
export function toGicsSector(name: string | null | undefined): string | null {
  if (!name) return null;
  return GICS[name.trim().toLowerCase()] ?? null;
}
