import { createServerClient } from "@supabase/ssr";
import { readStartPage, START_PAGE_COOKIE } from "@/lib/settings/preferences";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase middleware helper.
 * Refreshes the auth session on every request and protects routes.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to
  // debug auth issues in production.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Browsing (/app, /symbol) is open to guests; only account-specific
  // pages require a session.
  const PROTECTED_PREFIXES = ["/app/settings", "/app/admin"];
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    // Where the reader asked to land, validated against the routes we
    // have — an unknown value falls back to the dashboard.
    url.pathname = readStartPage(request.cookies.get(START_PAGE_COOKIE)?.value);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
