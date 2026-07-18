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
import { getDevRole } from "@/lib/dev-session";

export async function createClient() {
  // Dev-persona login (gst_dev_auth cookie present): there is no Supabase auth
  // session, so the RLS (anon) client would return nothing. Use the
  // service-role client so the app reads/writes the seeded demo tenant.
  // Requests without the cookie (i.e. real signed-up users) fall through to
  // the real RLS-scoped client below, regardless of NEXT_PUBLIC_AUTH_DISABLED.
  if (await getDevRole()) return createAdminClient();

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
