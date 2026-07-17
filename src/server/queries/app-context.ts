import "server-only";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
import { authDisabled } from "@/lib/env";
import type { TenantRow } from "@/lib/database.types";

export type AppContext = {
  userId: string;
  tenantId: string;
  role: string;
  userLabel: string;
  activeTenant: TenantRow;
  tenants: { tenantId: string; name: string }[];
  /** True if the signed-in user is on the SUPERADMIN_EMAILS allow-list. */
  isSuperAdmin: boolean;
  /**
   * True when a super admin is viewing this tenant via "View as" (/admin)
   * rather than as an actual member - the app shell shows a banner instead
   * of silently pretending they own the business.
   */
  impersonating: boolean;
};

/**
 * Resolve everything the app shell needs for the current request:
 * the active tenant context, the active tenant record, and the list of
 * businesses the user can switch between. Redirects to /onboarding if none.
 */
export async function getAppContext(): Promise<AppContext> {
  const { user, userId, tenantId, role } = await requireTenant();
  const superAdmin = isSuperAdmin(user.email);

  // Dev mode: no Supabase auth session, so RLS would return nothing. Load the
  // demo tenant directly with the service client so the shell has a tenant.
  if (authDisabled) {
    const svc = createAdminClient();
    const { data: tenant } = await svc
      .from("aimunim_tenants")
      .select("*")
      .eq("id", tenantId)
      .maybeSingle();
    return {
      userId,
      tenantId,
      role,
      userLabel: user.phone || user.email || "Demo",
      activeTenant: tenant as TenantRow,
      tenants: tenant ? [{ tenantId: tenant.id, name: tenant.name }] : [],
      isSuperAdmin: superAdmin,
      // The dev "superadmin" persona never has a real membership - landing
      // here at all means they explicitly chose "View as" from /admin.
      impersonating: superAdmin,
    };
  }

  const supabase = await createClient();

  // Businesses this user belongs to (RLS scopes to their own memberships).
  const { data: memberships } = await supabase
    .from("aimunim_memberships")
    .select("tenant_id")
    .order("created_at", { ascending: true });

  const tenantIds = (memberships ?? []).map((m) => m.tenant_id);

  let tenantRows: TenantRow[] | null = null;
  if (tenantIds.length > 0) {
    const { data } = await supabase
      .from("aimunim_tenants")
      .select("*")
      .in("id", tenantIds);
    tenantRows = data;
  } else if (superAdmin) {
    // No memberships - this is a super admin "viewing as" a tenant they
    // don't belong to. Fetch it with the service client (bypasses RLS);
    // access was already gated on isSuperAdmin() in getActiveContext().
    const admin = createAdminClient();
    const { data } = await admin
      .from("aimunim_tenants")
      .select("*")
      .eq("id", tenantId);
    tenantRows = data;
  }

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
    isSuperAdmin: superAdmin,
    impersonating: superAdmin && tenantIds.length === 0,
  };
}
