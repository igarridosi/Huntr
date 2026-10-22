import { describe, expect, it } from "vitest";
import { confirmOutcome, forwardToCallback, loginMessage } from "../auth-callback";

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
