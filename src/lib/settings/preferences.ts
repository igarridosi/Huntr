/**
 * The small decisions a reader gets to make, and the rules for reading
 * them back. Pure on purpose: the provider, the Server Action and the
 * settings screen all resolve a preference the same way.
 */

export type Theme = "dark" | "light";
export type ThemePreference = Theme | "system";

/** What was written to localStorage, read defensively. */
export function readThemePreference(stored: string | null | undefined): ThemePreference {
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** The theme actually applied: an explicit choice wins, otherwise the OS. */
export function resolveTheme(preference: ThemePreference, osPrefersLight: boolean): Theme {
  if (preference === "system") return osPrefersLight ? "light" : "dark";
  return preference;
}

/**
 * Opting out of first-party measurement. A cookie rather than a row:
 * it works for a signed-out reader, it is checked without a database
 * round trip on every event, and clearing cookies opts back in — which
 * is the behaviour people expect from a browser-level choice.
 */
export const TRACKING_COOKIE = "huntr_dnt";

export function isOptedOut(cookieValue: string | null | undefined): boolean {
  return cookieValue === "1";
}

/** Where the product opens after signing in. */
export const START_PAGES = [
  { value: "/app", label: "Dashboard" },
  { value: "/app/insights", label: "Insights" },
  { value: "/app/watchlists", label: "Watchlists" },
  { value: "/app/screener", label: "Screener" },
  { value: "/app/chart-builder", label: "Chart Builder" },
  { value: "/app/dcf-calculator", label: "DCF Calculator" },
  { value: "/app/portfolios", label: "Portfolios" },
] as const;

export type StartPage = (typeof START_PAGES)[number]["value"];
export const START_PAGE_KEY = "huntr-start-page";
export const DEFAULT_START_PAGE: StartPage = "/app";

/**
 * A stored start page is only honoured if it is still one of ours — a
 * route that was renamed or removed must not strand someone on a 404
 * every time they sign in.
 */
export function readStartPage(stored: string | null | undefined): StartPage {
  const match = START_PAGES.find((p) => p.value === stored);
  return match ? match.value : DEFAULT_START_PAGE;
}
