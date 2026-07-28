/**
 * Session refresh + route protection used by the root `proxy.ts`
 * (Next.js 16 renamed `middleware` -> `proxy`).
 *
 * On every matched request we:
 *  1. Refresh the Supabase auth session (rotates the cookie if needed).
 *  2. Redirect unauthenticated users away from protected app routes.
 *
 * IMPORTANT: always return the `supabaseResponse` object as-is (or copy its
 * cookies) so the refreshed auth cookies reach the browser. Creating a new
 * response without copying cookies will silently log users out.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { publicEnv, isSupabaseConfigured } from "@/lib/env";

/** Routes that do NOT require authentication. */
// /share = party shared-ledger portal (token-protected), /api/webhooks = WhatsApp,
// /api/internal = n8n internal API (bearer-token protected).
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/auth",
  "/api/health",
  "/share",
  "/store",
  "/api/webhooks",
  "/api/internal",
  "/api/cron",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Cookie set by the dev email+password login (see server/actions/auth.ts). */
const DEV_AUTH_COOKIE = "gst_dev_auth";

/**
 * The dev cookie is unsigned — anyone can set it — so it is only trusted on a
 * deployment that has explicitly disabled real auth, and never on Vercel
 * production. Kept in sync with lib/dev-session.ts (the two can't share code:
 * this file runs in the Edge proxy, dev-session.ts is `server-only`).
 * Both NEXT_PUBLIC_AUTH_DISABLED (build-inlined) and VERCEL_ENV are available
 * here despite the earlier comment's caution; the production check is the hard
 * backstop even if the flag is misconfigured.
 */
const DEV_PERSONAS_ALLOWED =
  process.env.NEXT_PUBLIC_AUTH_DISABLED === "true" &&
  process.env.VERCEL_ENV !== "production";

export async function updateSession(request: NextRequest) {
  // Until Supabase is configured (.env.local), don't gate routes — let the app
  // boot so the landing page and setup docs are reachable.
  if (!isSupabaseConfigured) {
    return NextResponse.next({ request });
  }

  // Dev login mode: a present dev-auth cookie means "signed in", so let the
  // request through (page-level requireTenant resolves the demo tenant).
  // Only honoured on dev/staging — see DEV_PERSONAS_ALLOWED. In production this
  // whole branch is skipped, so the unsigned cookie grants nothing and the real
  // Supabase auth check below runs for everyone.
  if (DEV_PERSONAS_ALLOWED) {
    const devRole = request.cookies.get(DEV_AUTH_COOKIE)?.value;
    // "superadmin" | "user" are the current role values; "1" is the legacy value.
    if (devRole === "superadmin" || devRole === "user" || devRole === "1") {
      return NextResponse.next({ request });
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser(). A simple mistake
  // here can make it very hard to debug random logouts.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
