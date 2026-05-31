/**
 * Server-side Supabase clients for use in Server Components, Server Actions,
 * and Route Handlers.
 *
 * - `createClient()` uses the ANON key + the user's session cookie, so RLS
 *   applies and the user only sees their own tenant's rows. Use this for
 *   nearly everything.
 * - `createAdminClient()` uses the SERVICE ROLE key and BYPASSES RLS. Only use
 *   it in trusted server code for operations that genuinely need it (e.g.
 *   provisioning a tenant during signup, super-admin views). Never expose it
 *   to the client.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { publicEnv, getServerEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component. This can be ignored
            // when the session is refreshed by the proxy (middleware).
          }
        },
      },
    },
  );
}

/**
 * Service-role client — bypasses RLS. SERVER-ONLY. Handle with care.
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
