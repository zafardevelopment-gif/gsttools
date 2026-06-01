/**
 * Server-side auth + tenant helpers used by pages, layouts and actions.
 *
 * TEMPORARY dev mode: when NEXT_PUBLIC_AUTH_DISABLED=true the app uses a simple
 * local email+password login (see server/actions/auth.ts -> devSignIn) instead
 * of Supabase OTP. A signed-in dev session is just the DEV_AUTH_COOKIE cookie,
 * and every request resolves to the seeded demo tenant. Remove this whole block
 * once real auth is implemented.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveContext } from "@/lib/tenant";
import { authDisabled, DEMO_TENANT_ID } from "@/lib/env";
import type { User } from "@supabase/supabase-js";

/** Name of the cookie that marks a logged-in dev session. */
export const DEV_AUTH_COOKIE = "gst_dev_auth";

// In dev mode there is no real auth.users row. id is null so created_by inserts
// NULL (the column is nullable) instead of violating the FK to auth.users.
const DEMO_USER = { id: null as unknown as string } as unknown as User;

/** True when a dev login cookie is present. */
async function isDevAuthed(): Promise<boolean> {
  const store = await cookies();
  return store.get(DEV_AUTH_COOKIE)?.value === "1";
}

/** Returns the current user or null. */
export async function getUser(): Promise<User | null> {
  if (authDisabled) return (await isDevAuthed()) ? DEMO_USER : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Redirects to /login if not authenticated; returns the user otherwise. */
export async function requireUser(): Promise<User> {
  if (authDisabled) {
    if (!(await isDevAuthed())) redirect("/login");
    return DEMO_USER;
  }
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For app pages: ensure the user is logged in AND has an active tenant.
 * Redirects to /onboarding if they have no business yet.
 */
export async function requireTenant() {
  if (authDisabled) {
    if (!(await isDevAuthed())) redirect("/login");
    return {
      user: DEMO_USER,
      userId: null as unknown as string,
      tenantId: DEMO_TENANT_ID,
      role: "owner" as string,
    };
  }
  const user = await requireUser();
  const ctx = await getActiveContext();
  if (!ctx) redirect("/onboarding");
  return { user, ...ctx };
}
