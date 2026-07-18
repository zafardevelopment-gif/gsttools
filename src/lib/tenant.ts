/**
 * Active-tenant resolution.
 *
 * A user can belong to multiple tenants (businesses) via the aimunim_memberships
 * table. The "active" tenant is stored in a cookie. Server code reads it here
 * and validates that the logged-in user is actually a member of that tenant
 * before trusting it.
 *
 * NOTE: RLS in Postgres is the real security boundary. This helper just picks
 * which tenant the UI is currently operating on; it never replaces RLS.
 */
import { cookies } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { DEMO_TENANT_ID } from "@/lib/env";
import { getDevRole } from "@/lib/dev-session";
import { isSuperAdmin } from "@/lib/admin";

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
  // Dev-persona login: skip the auth/membership lookup and operate on the demo tenant.
  if (await getDevRole()) {
    return {
      userId: null as unknown as string,
      tenantId: DEMO_TENANT_ID,
      role: "owner",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;

  // Fetch the user's memberships (RLS limits this to their own rows).
  const { data: memberships } = await supabase
    .from("aimunim_memberships")
    .select("tenant_id, role")
    .order("created_at", { ascending: true });

  if (memberships && memberships.length > 0) {
    const chosen =
      memberships.find((m) => m.tenant_id === requested) ?? memberships[0];
    return { userId: user.id, tenantId: chosen.tenant_id, role: chosen.role };
  }

  // No memberships: a platform super admin can still be "viewing as" a tenant
  // they explicitly picked from /admin (see server/actions/super-admin.ts,
  // which is the only place that sets this cookie without a membership row).
  // Bypasses RLS deliberately - access is gated on isSuperAdmin(), not on
  // tenant membership, which is correct for platform staff support access.
  if (requested && isSuperAdmin(user.email)) {
    const admin = createAdminClient();
    const { data: tenant } = await admin
      .from("aimunim_tenants")
      .select("id")
      .eq("id", requested)
      .maybeSingle();
    if (tenant) {
      return { userId: user.id, tenantId: tenant.id, role: "owner" };
    }
  }

  return null;
}

/** Throws if there is no active tenant context (use in actions/pages that require it). */
export async function requireActiveContext(): Promise<ActiveContext> {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("No active tenant. Please complete business setup.");
  return ctx;
}
