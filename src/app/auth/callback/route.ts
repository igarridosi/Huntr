/**
 * Confirmation email → signed in.
 *
 *   GET /auth/callback?code=…
 *
 * Exchanges the one-time code for a session (the PKCE verifier is in a
 * cookie set at sign-up, so this works in the browser that signed up) and
 * sends the reader into the app, on their start page. The code is not
 * carried over: it never reaches the address bar or analytics. There is no
 * `next` parameter on purpose, so the route cannot be used to redirect
 * anywhere else.
 *
 * Without a session (another browser, an expired link) it sends them to
 * /login with a line saying what happened.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/constants";
import { confirmOutcome } from "@/lib/auth-callback";
import { readStartPage, START_PAGE_COOKIE } from "@/lib/settings/preferences";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const target = request.nextUrl.clone();
  target.search = "";

  const code = params.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      target.pathname = readStartPage(request.cookies.get(START_PAGE_COOKIE)?.value);
      return NextResponse.redirect(target);
    }
  }

  target.pathname = ROUTES.LOGIN;
  // Opened bare, it was not a confirmation link: no claim either way.
  if (code || params.has("error_code")) {
    target.searchParams.set("confirm", confirmOutcome(params.get("error_code")));
  }
  return NextResponse.redirect(target);
}
