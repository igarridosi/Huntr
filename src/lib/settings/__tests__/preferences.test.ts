import { describe, expect, it } from "vitest";
import { isOptedOut, readStartPage, readThemePreference, resolveTheme, DEFAULT_START_PAGE } from "../preferences";

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

describe("opt out", () => {
  it("counts only an explicit 1 as opted out", () => {
    expect(isOptedOut("1")).toBe(true);
    expect(isOptedOut("0")).toBe(false);
    expect(isOptedOut(undefined)).toBe(false);
    expect(isOptedOut("true")).toBe(false);
  });
});
