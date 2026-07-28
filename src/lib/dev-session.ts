import "server-only";
import { cookies } from "next/headers";

/**
 * Cookie set by the dev/demo persona login (see server/actions/auth.ts ->
 * signInAction). It short-circuits real Supabase auth and drops the request
 * onto the seeded demo tenant — as a super admin, no less.
 *
 * SECURITY: this cookie is unsigned and unauthenticated. Anyone can set
 * `gst_dev_auth=superadmin` in their own browser. So it is ONLY honoured on a
 * deployment that has explicitly disabled real auth (NEXT_PUBLIC_AUTH_DISABLED
 * = "true") — i.e. local and staging. In production that flag is false, so the
 * cookie is ignored entirely and every request goes through Supabase Auth + RLS.
 *
 * An earlier version keyed off the cookie's PRESENCE alone, "so dev personas
 * and real signups can coexist on one deployment". That was a full auth bypass
 * in production: setting one cookie opened the platform /admin panel with no
 * login. The coexistence goal is preserved on dev/staging (where the flag is
 * on) without exposing it in production.
 *
 * Deliberately dependency-free (only `next/headers`) so lib/auth.ts,
 * lib/tenant.ts and lib/supabase/server.ts can all import it without a
 * circular-import error (those three already import from each other).
 */
export const DEV_AUTH_COOKIE = "gst_dev_auth";

export type DevRole = "superadmin" | "user";

/**
 * Whether dev-persona login is allowed on this deployment at all.
 * Read directly (not via lib/env) to keep this module dependency-free.
 *
 * Two independent gates, both must pass:
 *   1. Real auth is explicitly disabled (dev/staging opt-in).
 *   2. This is not a Vercel *production* deployment — a hard backstop so that
 *      even a misconfigured prod env (AUTH_DISABLED accidentally "true") cannot
 *      re-open the bypass.
 */
const DEV_PERSONAS_ALLOWED =
  process.env.NEXT_PUBLIC_AUTH_DISABLED === "true" &&
  process.env.VERCEL_ENV !== "production";

/** The signed-in dev persona for this request, or null to use real auth. */
export async function getDevRole(): Promise<DevRole | null> {
  // In production this is false, so the unsigned cookie can never grant access.
  if (!DEV_PERSONAS_ALLOWED) return null;

  const store = await cookies();
  const v = store.get(DEV_AUTH_COOKIE)?.value;
  // "1" is the legacy cookie value from before roles existed; treat as end user.
  if (v === "superadmin") return "superadmin";
  if (v === "user" || v === "1") return "user";
  return null;
}
