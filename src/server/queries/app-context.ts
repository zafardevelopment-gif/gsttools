import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth";
import type { TenantRow } from "@/lib/database.types";

export type AppContext = {
  userId: string;
  tenantId: string;
  role: string;
  userLabel: string;
  activeTenant: TenantRow;
  tenants: { tenantId: string; name: string }[];
};

/**
 * Resolve everything the app shell needs for the current request:
 * the active tenant context, the active tenant record, and the list of
 * businesses the user can switch between. Redirects to /onboarding if none.
 */
export async function getAppContext(): Promise<AppContext> {
  const { user, userId, tenantId, role } = await requireTenant();
  const supabase = await createClient();

  // Businesses this user belongs to (RLS scopes to their own memberships).
  const { data: memberships } = await supabase
    .from("GST_memberships")
    .select("tenant_id")
    .order("created_at", { ascending: true });

  const tenantIds = (memberships ?? []).map((m) => m.tenant_id);

  const { data: tenantRows } = await supabase
    .from("GST_tenants")
    .select("*")
    .in("id", tenantIds.length ? tenantIds : ["00000000-0000-0000-0000-000000000000"]);

  const tenants = (tenantRows ?? []).map((t) => ({
    tenantId: t.id,
    name: t.name,
  }));

  const activeTenant =
    (tenantRows ?? []).find((t) => t.id === tenantId) ?? (tenantRows ?? [])[0];

  return {
    userId,
    tenantId,
    role,
    userLabel: user.phone || user.email || "Account",
    activeTenant: activeTenant as TenantRow,
    tenants,
  };
}
