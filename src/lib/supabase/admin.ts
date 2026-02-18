import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using service role key.
 * Use for backend data jobs/reads that should not depend on request cookies.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || (!serviceRoleKey && !anonKey)) {
    throw new Error("Missing Supabase environment variables");
  }

  const key = serviceRoleKey ?? anonKey!;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
