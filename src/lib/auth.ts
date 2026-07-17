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
import { canAccessRoute } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { getActiveContext, ACTIVE_TENANT_COOKIE } from "@/lib/tenant";
import {
  authDisabled,
  DEMO_TENANT_ID,
  DEV_SUPERADMIN_EMAIL,
  DEV_USER_EMAIL,
} from "@/lib/env";
import { isSuperAdmin } from "@/lib/admin";
import type { User } from "@supabase/supabase-js";

/** Name of the cookie that marks a logged-in dev session. */
export const DEV_AUTH_COOKIE = "gst_dev_auth";

// Two dev personas: a platform-level super admin and a normal tenant end user.
// The cookie stores which one is signed in ("superadmin" | "user").
// (Re-exported from lib/env.ts, which is the canonical source - see the
// comment there for why admin.ts reads them from env.ts instead of here.)
export { DEV_SUPERADMIN_EMAIL, DEV_USER_EMAIL };

export type DevRole = "superadmin" | "user";

// In dev mode there is no real auth.users row. id is null so created_by inserts
// NULL (the column is nullable) instead of violating the FK to auth.users.
function devUser(role: DevRole): User {
  return {
    id: null as unknown as string,
    email: role === "superadmin" ? DEV_SUPERADMIN_EMAIL : DEV_USER_EMAIL,
  } as unknown as User;
}

/** The signed-in dev persona, or null when the cookie is absent/invalid. */
async function getDevRole(): Promise<DevRole | null> {
  const store = await cookies();
  const v = store.get(DEV_AUTH_COOKIE)?.value;
  // "1" is the legacy cookie value from before roles existed; treat as end user.
  if (v === "superadmin") return "superadmin";
  if (v === "user" || v === "1") return "user";
  return null;
}

/** Returns the current user or null. */
export async function getUser(): Promise<User | null> {
  if (authDisabled) {
    const role = await getDevRole();
    return role ? devUser(role) : null;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Redirects to /login if not authenticated; returns the user otherwise. */
export async function requireUser(): Promise<User> {
  if (authDisabled) {
    const role = await getDevRole();
    if (!role) redirect("/login");
    return devUser(role);
  }
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For app pages: ensure the user is logged in AND has an active tenant.
 * Redirects to /onboarding if they have no business yet.
 *
 * A super admin has no tenant of their own - they only get one by explicitly
 * choosing "View as" on a tenant from /admin (see server/actions/super-admin.ts),
 * which sets ACTIVE_TENANT_COOKIE. Without that, they're bounced to /admin
 * instead of silently landing on some tenant's dashboard as if they own it.
 */
export async function requireTenant() {
  if (authDisabled) {
    const role = await getDevRole();
    if (!role) redirect("/login");

    if (role === "superadmin") {
      const cookieStore = await cookies();
      const viewingTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
      if (!viewingTenantId) redirect("/admin");
      return {
        user: devUser(role),
        userId: null as unknown as string,
        tenantId: viewingTenantId,
        role: "owner" as string,
      };
    }

    return {
      user: devUser(role),
      userId: null as unknown as string,
      tenantId: DEMO_TENANT_ID,
      role: "owner" as string,
    };
  }
  const user = await requireUser();
  const ctx = await getActiveContext();
  if (!ctx) {
    redirect(isSuperAdmin(user.email) ? "/admin" : "/onboarding");
  }
  return { user, ...ctx };
}

/**
 * Page guard: user logged-in + tenant active + role allowed for this route.
 * Denied roles bounce to /dashboard (or /invoices for delivery boys).
 */
export async function requireRouteAccess(routePrefix: string) {
  const ctx = await requireTenant();
  if (!canAccessRoute(ctx.role, routePrefix)) {
    redirect(canAccessRoute(ctx.role, "/dashboard") ? "/dashboard" : "/invoices");
  }
  return ctx;
}
