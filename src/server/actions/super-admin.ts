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
 * Create a brand-new auth.users account and assign it to a tenant — the
 * platform-level equivalent of a tenant's own "create new user" flow (see
 * server/actions/users.ts createUserAction), for when support/onboarding
 * needs to hand a business its first login without the owner doing it
 * themselves.
 *
 * Accepts either an existing tenantId, or newBusiness (name + GST state
 * code) to spin up a brand-new business at the same time — useful because
 * the Users page previously only let you assign into a tenant that already
 * existed, which meant onboarding a genuinely new customer required first
 * going to create the business some other way. This does the same three
 * inserts (tenant, trial subscription, owner-of-nothing-yet membership)
 * that the self-serve onboarding RPC (gst_create_tenant_with_owner) does,
 * but via the service-role client instead of that RPC — the RPC keys off
 * auth.uid() to decide who the owner is, which only works when the new
 * tenant's own owner is the one calling it, not an admin acting on their
 * behalf with no session for them yet.
 */
export async function createPlatformUserAction(input: {
  tenantId?: string;
  newBusiness?: { name: string; stateCode: string };
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
  if (!input.tenantId && !input.newBusiness) {
    return { error: "Choose a business or enter a name for a new one." };
  }

  const admin = createAdminClient();

  let tenantId = input.tenantId;
  if (!tenantId) {
    const name = input.newBusiness!.name.trim();
    const stateCode = input.newBusiness!.stateCode.trim();
    if (!name) return { error: "Business name is required." };
    if (!/^[0-9]{2}$/.test(stateCode)) return { error: "Choose a state." };

    const { data: newTenant, error: tenantErr } = await admin
      .from("aimunim_tenants")
      .insert({ name, state_code: stateCode, plan: "trial" })
      .select("id")
      .single();
    if (tenantErr || !newTenant) {
      return { error: tenantErr?.message ?? "Could not create the business." };
    }
    tenantId = newTenant.id;

    const now = new Date();
    const trialEnd = new Date(now.getTime() + PLANS.trial.trialDays * 86400000);
    const { error: subErr } = await admin.from("aimunim_subscriptions").insert({
      tenant_id: tenantId,
      plan: "trial",
      status: "trialing",
      trial_ends_at: trialEnd.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: trialEnd.toISOString(),
    });
    if (subErr) {
      await admin.from("aimunim_tenants").delete().eq("id", tenantId);
      return { error: subErr.message };
    }
  } else {
    const { data: tenant } = await admin
      .from("aimunim_tenants")
      .select("id")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenant) return { error: "Tenant not found." };
  }

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
    tenant_id: tenantId,
    user_id: created.user.id,
    role: input.role,
  });
  if (memberErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: memberErr.message };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Change a member's role within their tenant, from the platform Users page.
 * Mirrors what a tenant owner can already do from their own Manage Users
 * screen (server/actions/users.ts), just reachable for support/admin
 * purposes without being a member of that tenant.
 */
export async function updateMembershipRoleAction(
  membershipId: string,
  role: MembershipRoleKey,
): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "Forbidden." };
  }
  if (!MEMBERSHIP_ROLES.includes(role)) return { error: "Unknown role." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("aimunim_memberships")
    .update({ role })
    .eq("id", membershipId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Permanently delete a user's auth.users account — memberships cascade-delete
 * automatically (aimunim_memberships.user_id has ON DELETE CASCADE). Blocked
 * when this would leave one of their tenants without any owner, since that
 * tenant would then be unreachable through the normal app (nobody could add
 * a new member); reassign ownership first in that case.
 */
export async function deleteUserAction(userId: string): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "Forbidden." };
  }

  const admin = createAdminClient();

  const { data: memberships } = await admin
    .from("aimunim_memberships")
    .select("tenant_id, role")
    .eq("user_id", userId);

  for (const m of memberships ?? []) {
    if (m.role !== "owner") continue;
    const { count } = await admin
      .from("aimunim_memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", m.tenant_id)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return {
        error:
          "This user is the only owner of at least one business — reassign ownership before deleting them.",
      };
    }
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  revalidatePath("/admin/activity");
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
