/**
 * Server-side auth + tenant helpers used by pages, layouts and actions.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveContext } from "@/lib/tenant";
import type { User } from "@supabase/supabase-js";

/** Returns the current user or null. */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Redirects to /login if not authenticated; returns the user otherwise. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For app pages: ensure the user is logged in AND has an active tenant.
 * Redirects to /onboarding if they have no business yet.
 */
export async function requireTenant() {
  const user = await requireUser();
  const ctx = await getActiveContext();
  if (!ctx) redirect("/onboarding");
  return { user, ...ctx };
}
