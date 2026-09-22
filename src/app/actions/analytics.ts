"use server";

/**
 * First-party analytics. One entry point, `recordEvent`, called from the
 * browser through a Server Action rather than a public route: there is no
 * endpoint to spam and no analytics key shipped to the client.
 *
 * A visitor is an opaque random id in a 30-day httpOnly cookie. No IP
 * address, user agent or referrer is stored, and a signed-out reader is
 * never linked to an account. Google Analytics still measures traffic in
 * the aggregate; this measures the product — which companies get looked
 * up, how often a valuation is withheld, what gets exported.
 */

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isCountedPath, parseEvent } from "@/lib/analytics/events";

const VISITOR_COOKIE = "huntr_vid";
const VISITOR_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The id that lets two page views be counted as one person. Random, per
 * browser, and readable by nothing but the server.
 */
async function visitorId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing && UUID.test(existing)) return existing;

  const fresh = crypto.randomUUID();
  jar.set(VISITOR_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VISITOR_MAX_AGE,
  });
  return fresh;
}

/** The signed-in account, when there is one. Never blocks the write. */
async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Record one event. Silent by design: a measurement that throws would
 * break the page it is measuring, so every failure — bad input, no
 * database, no service key — ends as a no-op.
 */
export async function recordEvent(raw: unknown): Promise<void> {
  const row = parseEvent(raw);
  if (!row) return;
  if (row.path && !isCountedPath(row.path)) return;

  try {
    const [visitor_id, user_id] = await Promise.all([visitorId(), currentUserId()]);
    const supabase = createAdminClient();
    await supabase.from("analytics_events").insert({
      event: row.event,
      path: row.path,
      ticker: row.ticker,
      props: row.props,
      visitor_id,
      user_id,
    });
  } catch {
    // Analytics never speaks up.
  }
}
