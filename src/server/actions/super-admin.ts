"use server";

/**
 * Platform-level actions for the /admin super-admin panel. Every action here
 * re-checks isSuperAdmin() itself (never trust the UI) and uses the
 * service-role client, since a super admin is deliberately NOT a member of
 * the tenants they're managing — normal RLS would show them nothing.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE } from "@/lib/tenant";
import { PLANS } from "@/lib/constants";

export type ActionResult = { ok?: true; error?: string };

/** Plan values the DB check constraint actually allows (see 0002_core_tenancy.sql). */
const DB_PLAN_VALUES = ["trial", "silver", "gold", "diamond"] as const;
export type DbPlanKey = (typeof DB_PLAN_VALUES)[number];

const DB_STATUS_VALUES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
] as const;
export type DbStatusKey = (typeof DB_STATUS_VALUES)[number];

const MEMBERSHIP_ROLES = [
  "owner",
  "admin",
  "partner",
  "ca",
  "salesman",
  "stock_manager",
  "delivery_boy",
  "staff",
] as const;
export type MembershipRoleKey = (typeof MEMBERSHIP_ROLES)[number];

async function requireSuperAdmin() {
  const user = await requireUser();
  if (!isSuperAdmin(user.email)) {
    throw new Error("Forbidden — super admin only.");
  }
  return user;
}

/**
 * "View as" — open a tenant's dashboard as a super admin, without being a
 * member of it. Sets the same cookie the tenant switcher uses; lib/tenant.ts
 * getActiveContext() trusts it for super admins specifically.
 */
export async function viewAsTenantAction(tenantId: string): Promise<void> {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("aimunim_tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Short-lived on purpose — this is a support/impersonation session, not a
    // real membership. Re-open from /admin when it expires.
    maxAge: 60 * 60 * 4,
  });
  redirect("/dashboard");
}

/** Stop viewing a tenant and return to the platform panel. */
export async function exitImpersonationAction(): Promise<void> {
  await requireSuperAdmin();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_TENANT_COOKIE);
  redirect("/admin");
}

/**
 * Change a tenant's plan from the admin panel. Only DB_PLAN_VALUES are legal
 * (the aimunim_tenants.plan / aimunim_subscriptions.plan check constraints
 * don't include "platinum"/"enterprise" yet — those are marketing-page-only
 * tiers today, see lib/constants.ts PLANS).
 */
export async function updateTenantPlanAction(
  tenantId: string,
  plan: DbPlanKey,
): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "Forbidden." };
  }
  if (!DB_PLAN_VALUES.includes(plan)) return { error: "Unknown plan." };

  const admin = createAdminClient();
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const isTrial = plan === "trial";

  const { error: subError } = await admin
    .from("aimunim_subscriptions")
    .update({
      plan,
      status: isTrial ? "trialing" : "active",
      trial_ends_at: isTrial
        ? new Date(now.getTime() + PLANS.trial.trialDays * 86400000).toISOString()
        : null,
      current_period_start: now.toISOString(),
      current_period_end: isTrial ? null : periodEnd.toISOString(),
    })
    .eq("tenant_id", tenantId);
  if (subError) return { error: subError.message };

  const { error: tenantError } = await admin
    .from("aimunim_tenants")
    .update({ plan })
    .eq("id", tenantId);
  if (tenantError) return { error: tenantError.message };

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Create a brand-new auth.users account and assign it straight to a chosen
 * tenant — the platform-level equivalent of a tenant's own "create new
 * user" flow (see server/actions/users.ts createUserAction), for when
 * support/onboarding needs to hand a business its first login without the
 * owner doing it themselves.
 */
export async function createPlatformUserAction(input: {
  tenantId: string;
  email: string;
  password: string;
  role: MembershipRoleKey;
}): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "Forbidden." };
  }
  if (!MEMBERSHIP_ROLES.includes(input.role)) return { error: "Unknown role." };
  if (input.password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("aimunim_tenants")
    .select("id")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (!tenant) return { error: "Tenant not found." };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return {
      error:
        createErr?.message?.includes("already been registered")
          ? "An account with that email already exists."
          : (createErr?.message ?? "Could not create the account."),
    };
  }

  const { error: memberErr } = await admin.from("aimunim_memberships").insert({
    tenant_id: input.tenantId,
    user_id: created.user.id,
    role: input.role,
  });
  if (memberErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: memberErr.message };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Directly set a tenant's subscription status — this is how "suspend" works
 * today: there's no separate suspended flag, so setting status to
 * "canceled" (or "expired"/"past_due") makes isSubscriptionActive() return
 * false, which blocks invoice creation and paid features for that tenant.
 */
export async function updateSubscriptionStatusAction(
  tenantId: string,
  status: DbStatusKey,
): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "Forbidden." };
  }
  if (!DB_STATUS_VALUES.includes(status)) return { error: "Unknown status." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("aimunim_subscriptions")
    .update({ status })
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}
