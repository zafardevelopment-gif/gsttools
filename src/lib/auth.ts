/**
 * Server-side auth + tenant helpers used by pages, layouts and actions.
 *
 * Dev-persona login: visiting /login and signing in as one of the hardcoded
 * personas (see server/actions/auth.ts -> devSignIn) sets the DEV_AUTH_COOKIE
 * and every request carrying it resolves to the seeded demo tenant, bypassing
 * Supabase auth entirely. Requests WITHOUT that cookie always use real
 * Supabase auth + RLS, regardless of NEXT_PUBLIC_AUTH_DISABLED — see
 * lib/dev-session.ts for why the cookie (not the global flag) is the signal.
 * This lets real signups and the dev personas coexist on one deployment.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { getActiveContext, ACTIVE_TENANT_COOKIE } from "@/lib/tenant";
import { DEMO_TENANT_ID, DEV_SUPERADMIN_EMAIL, DEV_USER_EMAIL } from "@/lib/env";
import { getDevRole, DEV_AUTH_COOKIE, type DevRole } from "@/lib/dev-session";
import { isSuperAdmin } from "@/lib/admin";
import type { User } from "@supabase/supabase-js";

export { DEV_AUTH_COOKIE };

// Two dev personas: a platform-level super admin and a normal tenant end user.
// The cookie stores which one is signed in ("superadmin" | "user").
// (Re-exported from lib/env.ts, which is the canonical source - see the
// comment there for why admin.ts reads them from env.ts instead of here.)
export { DEV_SUPERADMIN_EMAIL, DEV_USER_EMAIL };

export type { DevRole };

// In dev mode there is no real auth.users row. id is null so created_by inserts
// NULL (the column is nullable) instead of violating the FK to auth.users.
function devUser(role: DevRole): User {
  return {
    id: null as unknown as string,
    email: role === "superadmin" ? DEV_SUPERADMIN_EMAIL : DEV_USER_EMAIL,
  } as unknown as User;
}

/** Returns the current user or null. */
export async function getUser(): Promise<User | null> {
  const role = await getDevRole();
  if (role) return devUser(role);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Redirects to /login if not authenticated; returns the user otherwise. */
export async function requireUser(): Promise<User> {
  const role = await getDevRole();
  if (role) return devUser(role);
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
  const devRole = await getDevRole();
  if (devRole) {
    const role = devRole;

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
