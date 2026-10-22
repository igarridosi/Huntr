/**
 * The way back from a confirmation email.
 *
 * Supabase sends the reader to /auth/callback with a one-time `code`, which
 * the route exchanges for a session server-side and then drops from the URL,
 * so it never reaches the address bar or analytics. When the address it
 * asked for is not on Supabase's allow-list, Supabase sends them to the Site
 * URL instead (`/?code=…`): the middleware forwards that to the callback too.
 */

export const AUTH_CALLBACK_PATH = "/auth/callback";

/** What /login tells someone the callback sent there. */
export type ConfirmOutcome = "done" | "expired";

/**
 * The callback URL for a request that landed on the home page with the
 * parameters of a confirmation link, or null. Only the home page: the
 * password reset reads its own `code` on /reset-password.
 */
export function forwardToCallback(url: URL): URL | null {
  if (url.pathname !== "/") return null;
  if (!url.searchParams.has("code") && !url.searchParams.has("error_code")) return null;
  const target = new URL(url);
  target.pathname = AUTH_CALLBACK_PATH;
  return target;
}

/**
 * Why a confirmation link did not sign someone in. Supabase marks a link
 * that is stale or already used as `otp_expired`. Anything else (the link
 * opened in another browser than the one that signed up, most often) still
 * confirmed the address, which happens before the redirect: only signing
 * in is left.
 */
export function confirmOutcome(errorCode: string | null): ConfirmOutcome {
  return errorCode === "otp_expired" ? "expired" : "done";
}

/** The message /login shows for the query it was opened with, if any. */
export function loginMessage(params: URLSearchParams): { kind: "notice" | "error"; text: string } | null {
  if (params.get("checkEmail") === "1") {
    return { kind: "notice", text: "Account created. Check your inbox to confirm it, then sign in." };
  }
  if (params.get("reset") === "1") {
    return { kind: "notice", text: "Password updated. Sign in with your new password." };
  }
  const confirm = params.get("confirm");
  if (confirm === "done") {
    return { kind: "notice", text: "Your email is confirmed. Sign in to continue." };
  }
  if (confirm === "expired") {
    return {
      kind: "error",
      text: "That confirmation link has expired or was already used. Try signing in; if your email still isn't confirmed, create the account again for a fresh link.",
    };
  }
  return null;
}
