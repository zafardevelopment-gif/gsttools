import "server-only";
import { cookies } from "next/headers";

/**
 * Cookie set by the dev email+password login (see server/actions/auth.ts ->
 * devSignIn). Its presence — not the global NEXT_PUBLIC_AUTH_DISABLED flag —
 * is what decides whether a given request uses the demo-tenant dev bypass or
 * real Supabase auth. This lets both coexist on the same deployment: testers
 * who log in with the dev personas keep working exactly as before, while
 * anyone who signs up for real gets a genuine, isolated tenant via Supabase
 * Auth + RLS.
 *
 * Deliberately dependency-free (only `next/headers`) so lib/auth.ts,
 * lib/tenant.ts and lib/supabase/server.ts can all import it without a
 * circular-import error (those three already import from each other).
 */
export const DEV_AUTH_COOKIE = "gst_dev_auth";

export type DevRole = "superadmin" | "user";

/** The signed-in dev persona for this request, or null to use real auth. */
export async function getDevRole(): Promise<DevRole | null> {
  const store = await cookies();
  const v = store.get(DEV_AUTH_COOKIE)?.value;
  // "1" is the legacy cookie value from before roles existed; treat as end user.
  if (v === "superadmin") return "superadmin";
  if (v === "user" || v === "1") return "user";
  return null;
}
