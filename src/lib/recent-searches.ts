const RECENT_SEARCHES_KEY = "huntr:recent-searches";
const RECENT_SEARCHES_LIMIT = 8;

function isBrowser() {
  return typeof window !== "undefined";
}

function sanitizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

export function getRecentSearches(): string[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => (typeof item === "string" ? sanitizeTicker(item) : ""))
      .filter(Boolean)
      .slice(0, RECENT_SEARCHES_LIMIT);
  } catch {
    return [];
  }
}

export function addRecentSearch(ticker: string): string[] {
  if (!isBrowser()) return [];

  const normalized = sanitizeTicker(ticker);
  if (!normalized) return getRecentSearches();

  const next = [
    normalized,
    ...getRecentSearches().filter((item) => item !== normalized),
  ].slice(0, RECENT_SEARCHES_LIMIT);

  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    return next;
  }

  return next;
}
