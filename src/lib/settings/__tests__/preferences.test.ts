import { describe, expect, it } from "vitest";
import { isOptedOut, readStartPage, readThemePreference, resolveTheme, startPageFromCookieString, DEFAULT_START_PAGE } from "../preferences";

describe("theme preference", () => {
  it("reads an explicit choice and treats anything else as following the system", () => {
    expect(readThemePreference("light")).toBe("light");
    expect(readThemePreference("dark")).toBe("dark");
    expect(readThemePreference(null)).toBe("system");
    expect(readThemePreference("solarized")).toBe("system");
  });

  it("resolves the theme actually applied", () => {
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("light");
    // Dark is the product default when the OS says nothing else.
    expect(resolveTheme("system", false)).toBe("dark");
  });
});

describe("start page", () => {
  it("only honours a route the product still has", () => {
    expect(readStartPage("/app/screener")).toBe("/app/screener");
    expect(readStartPage("/app/removed-page")).toBe(DEFAULT_START_PAGE);
    expect(readStartPage(null)).toBe(DEFAULT_START_PAGE);
    expect(readStartPage("https://elsewhere.example/app")).toBe(DEFAULT_START_PAGE);
  });
});

describe("start page cookie", () => {
  it("picks our cookie out of the jar, whatever else is in it", () => {
    expect(startPageFromCookieString("huntr_vid=abc; huntr_start=%2Fapp%2Fscreener; theme=dark")).toBe("/app/screener");
    expect(startPageFromCookieString("huntr_start=/app/chart-builder")).toBe("/app/chart-builder");
    // A name our own is a suffix of must not be mistaken for ours.
    expect(startPageFromCookieString("not_huntr_start=/app/screener")).toBe(DEFAULT_START_PAGE);
    expect(startPageFromCookieString("")).toBe(DEFAULT_START_PAGE);
    expect(startPageFromCookieString(null)).toBe(DEFAULT_START_PAGE);
  });

  it("never returns a route we do not have, however the cookie was written", () => {
    // The redirect target comes from this function, so a hand-edited
    // cookie must not be able to send anyone off the site.
    expect(startPageFromCookieString("huntr_start=https%3A%2F%2Felsewhere.example")).toBe(DEFAULT_START_PAGE);
    expect(startPageFromCookieString("huntr_start=%2F%2Fevil.example")).toBe(DEFAULT_START_PAGE);
    expect(startPageFromCookieString("huntr_start=%E0%A4%A")).toBe(DEFAULT_START_PAGE);
  });
});

describe("opt out", () => {
  it("counts only an explicit 1 as opted out", () => {
    expect(isOptedOut("1")).toBe(true);
    expect(isOptedOut("0")).toBe(false);
    expect(isOptedOut(undefined)).toBe(false);
    expect(isOptedOut("true")).toBe(false);
  });
});
