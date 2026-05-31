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
const PUBLIC_PATHS = ["/", "/login", "/auth", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function updateSession(request: NextRequest) {
  // Until Supabase is configured (.env.local), don't gate routes — let the app
  // boot so the landing page and setup docs are reachable.
  if (!isSupabaseConfigured) {
    return NextResponse.next({ request });
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
