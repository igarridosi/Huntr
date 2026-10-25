import { describe, expect, it } from "vitest";
import { confirmOutcome, forwardToCallback, loginMessage, safeReturnPath, withReturnPath } from "../auth-callback";

describe("forwardToCallback", () => {
  it("forwards a confirmation code that landed on the home page, keeping it", () => {
    const target = forwardToCallback(new URL("https://huntrvalue.me/?code=abc"));
    expect(target?.pathname).toBe("/auth/callback");
    expect(target?.searchParams.get("code")).toBe("abc");
    expect(target?.origin).toBe("https://huntrvalue.me");
  });

  it("forwards an expired link too, so /login can say so", () => {
    const target = forwardToCallback(new URL("https://huntrvalue.me/?error=access_denied&error_code=otp_expired"));
    expect(target?.pathname).toBe("/auth/callback");
    expect(target?.searchParams.get("error_code")).toBe("otp_expired");
  });

  it("leaves the home page alone otherwise", () => {
    expect(forwardToCallback(new URL("https://huntrvalue.me/"))).toBeNull();
    expect(forwardToCallback(new URL("https://huntrvalue.me/?utm_source=threads"))).toBeNull();
  });

  it("leaves other pages alone: the password reset reads its own code", () => {
    expect(forwardToCallback(new URL("https://huntrvalue.me/reset-password?code=abc"))).toBeNull();
  });
});

describe("confirmOutcome", () => {
  it("tells an expired link apart from a confirmed address", () => {
    expect(confirmOutcome("otp_expired")).toBe("expired");
    expect(confirmOutcome(null)).toBe("done");
    expect(confirmOutcome("bad_code_verifier")).toBe("done");
  });
});

describe("loginMessage", () => {
  const msg = (q: string) => loginMessage(new URLSearchParams(q));

  it("says what the callback did", () => {
    expect(msg("confirm=done")).toMatchObject({ kind: "notice" });
    expect(msg("confirm=expired")).toMatchObject({ kind: "error" });
  });

  it("keeps the existing notices", () => {
    expect(msg("checkEmail=1")?.text).toMatch(/Check your inbox/);
    expect(msg("reset=1")?.text).toMatch(/Password updated/);
  });

  it("says nothing for anything else", () => {
    expect(msg("")).toBeNull();
    expect(msg("confirm=whatever")).toBeNull();
  });
});

describe("safeReturnPath", () => {
  it("keeps the app's own pages, query included", () => {
    expect(safeReturnPath("/app")).toBe("/app");
    expect(safeReturnPath("/app/dcf-calculator?ticker=AAPL")).toBe("/app/dcf-calculator?ticker=AAPL");
    expect(safeReturnPath("/symbol/MSFT/financials")).toBe("/symbol/MSFT/financials");
  });

  it("refuses anything that could leave the site or is not a page of the app", () => {
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/apps", "/login", "/app\\..\\x", "/app /x", "/symbolic"]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
});

describe("withReturnPath", () => {
  it("adds the page as next, encoded", () => {
    expect(withReturnPath("/signup", "/app/watchlists?x=1")).toBe("/signup?next=%2Fapp%2Fwatchlists%3Fx%3D1");
  });

  it("leaves the route bare for a page it would not return to", () => {
    expect(withReturnPath("/login", "/")).toBe("/login");
  });
});
