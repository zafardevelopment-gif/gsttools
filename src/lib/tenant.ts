/**
 * Active-tenant resolution.
 *
 * A user can belong to multiple tenants (businesses) via the GST_memberships
 * table. The "active" tenant is stored in a cookie. Server code reads it here
 * and validates that the logged-in user is actually a member of that tenant
 * before trusting it.
 *
 * NOTE: RLS in Postgres is the real security boundary. This helper just picks
 * which tenant the UI is currently operating on; it never replaces RLS.
 */
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_TENANT_COOKIE = "gst_active_tenant";

export type ActiveContext = {
  userId: string;
  tenantId: string;
  role: string;
};

/**
 * Returns the active tenant context for the current request, or null if the
 * user is not authenticated or has no membership.
 */
export async function getActiveContext(): Promise<ActiveContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;

  // Fetch the user's memberships (RLS limits this to their own rows).
  const { data: memberships } = await supabase
    .from("GST_memberships")
    .select("tenant_id, role")
    .order("created_at", { ascending: true });

  if (!memberships || memberships.length === 0) return null;

  const chosen =
    memberships.find((m) => (m as { tenant_id: string }).tenant_id === requested) ??
    memberships[0];

  const m = chosen as { tenant_id: string; role: string };
  return { userId: user.id, tenantId: m.tenant_id, role: m.role };
}

/** Throws if there is no active tenant context (use in actions/pages that require it). */
export async function requireActiveContext(): Promise<ActiveContext> {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("No active tenant. Please complete business setup.");
  return ctx;
}
