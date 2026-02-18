export const TICKER_LOGOS_CDN = "https://cdn.tickerlogos.com";
export const TICKER_LOGOS_ATTRIBUTION_URL =
  "https://www.allinvestview.com/tools/ticker-logos/";

/**
 * Extract a clean domain from a website value.
 * Accepts values like:
 *   - https://www.apple.com
 *   - apple.com
 *   - www.apple.com
 */
export function extractDomainFromWebsite(
  website: string | null | undefined
): string | null {
  if (!website) return null;

  const trimmed = website.trim();
  if (!trimmed) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const hostname = new URL(withProtocol).hostname.toLowerCase();
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Build logo URL using AllInvestView's free ticker logos CDN.
 * Falls back to AllInvestView favicon when no domain is available.
 */
export function buildTickerLogoUrl(website: string | null | undefined): string {
  const domain = extractDomainFromWebsite(website);
  if (domain) {
    return `${TICKER_LOGOS_CDN}/${domain}`;
  }
  return "https://www.allinvestview.com/favicon.ico";
}

/**
 * Normalize website value to a full URL for UI links.
 */
export function normalizeWebsiteUrl(
  website: string | null | undefined
): string {
  const domain = extractDomainFromWebsite(website);
  return domain ? `https://${domain}` : "";
}
