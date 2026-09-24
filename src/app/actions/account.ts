"use server";

/**
 * What a person can do with their own account: take their data out,
 * stop being measured, or leave.
 *
 * Every read here goes through the request-scoped client, so Row Level
 * Security is what decides which rows come back — the service role is
 * used for exactly one thing, deleting the auth user, which RLS cannot
 * express.
 */

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TRACKING_COOKIE } from "@/lib/settings/preferences";

/** The tables a person's account owns, in the order they are exported. */
const OWNED_TABLES = ["user_watchlist_state", "user_portfolio_state", "user_dcf_scenarios", "user_charts"] as const;

export interface AccountExport {
  exportedAt: string;
  account: { id: string; email: string | null; createdAt: string | null };
  data: Record<string, unknown[]>;
}

/**
 * Everything this account holds, as JSON. Nothing is computed or
 * summarised: it is the rows as stored, so the file can be read back
 * or handed to anything else.
 */
export async function exportAccountData(): Promise<{ data: AccountExport | null; error: string | null }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { data: null, error: "Not signed in." };

  const data: Record<string, unknown[]> = {};
  for (const table of OWNED_TABLES) {
    const { data: rows, error } = await supabase.from(table).select("*");
    // A table that is not there yet is not a failed export, just an empty one.
    data[table] = error ? [] : (rows ?? []);
  }

  return {
    data: {
      exportedAt: new Date().toISOString(),
      account: { id: auth.user.id, email: auth.user.email ?? null, createdAt: auth.user.created_at ?? null },
      data,
    },
    error: null,
  };
}

/** How much is on file, for the screen that offers to export or delete it. */
export async function accountDataCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return {};

  const counts: Record<string, number> = {};
  await Promise.all(
    OWNED_TABLES.map(async (table) => {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      counts[table] = error ? 0 : count ?? 0;
    })
  );
  return counts;
}

/** Stop — or resume — first-party measurement in this browser. */
export async function setTrackingOptOut(optOut: boolean): Promise<void> {
  const jar = await cookies();
  if (optOut) {
    jar.set(TRACKING_COOKIE, "1", {
      httpOnly: false, // The choice is the reader's; nothing here is a secret.
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    jar.delete(TRACKING_COOKIE);
  }
}

/**
 * Close the account. The owned rows go first — `ON DELETE CASCADE`
 * would take them anyway, but deleting them under RLS proves they were
 * this account's — and then the auth user, which is the part only the
 * service role can do. There is no undo, which is why the caller has to
 * type the email to get here.
 */
export async function deleteAccount(confirmation: string): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { ok: false, error: "Not signed in." };

  const typed = confirmation.trim().toLowerCase();
  if (!user.email || typed !== user.email.toLowerCase()) {
    return { ok: false, error: "The email typed does not match this account." };
  }

  for (const table of OWNED_TABLES) {
    await supabase.from(table).delete().eq("user_id", user.id);
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the account." };
  }

  await supabase.auth.signOut();
  return { ok: true, error: null };
}
