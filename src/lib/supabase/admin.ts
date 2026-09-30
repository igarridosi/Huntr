// The service role bypasses RLS: a client bundle that pulled this in would
// ship the key. Importing it from a client module fails the build.
import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using service role key.
 * Use for backend data jobs/reads that should not depend on request cookies.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createAdminClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
