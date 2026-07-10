"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { logAudit } from "@/server/audit";

export type ActionResult = { ok?: true; error?: string };

const ROLES = [
  "owner",
  "admin",
  "partner",
  "ca",
  "salesman",
  "stock_manager",
  "delivery_boy",
  "staff",
] as const;

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(ROLES).default("staff"),
});

/**
 * Add an existing auth user to this business by email.
 * (Full email-invite flow comes with real auth; for now the user must already
 * have an account — e.g. created via the SQL user script or signup.)
 */
export async function inviteUserAction(
  input: z.input<typeof inviteSchema>,
): Promise<ActionResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId, userId, role } = await requireActiveContext();
  if (role !== "owner" && role !== "admin") {
    return { error: "Only an owner or admin can manage users." };
  }

  // Look up the auth user by email (service role; auth schema).
  const admin = createAdminClient();
  const { data: page, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) return { error: listErr.message };
  const target = page.users.find(
    (u) => u.email?.toLowerCase() === v.email.toLowerCase(),
  );
  if (!target) {
    return {
      error: `No account found for ${v.email}. Ask them to sign up first, then invite again.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("aimunim_memberships").insert({
    tenant_id: tenantId,
    user_id: target.id,
    role: v.role,
  });
  if (error) {
    return {
      error: error.code === "23505" ? "That user is already a member." : error.message,
    };
  }

  logAudit({
    tenantId,
    userId,
    action: "member.invited",
    entityType: "membership",
    data: { email: v.email, role: v.role },
  });
  revalidatePath("/users");
  return { ok: true };
}

export async function changeRoleAction(input: {
  membershipId: string;
  role: (typeof ROLES)[number];
}): Promise<ActionResult> {
  if (!ROLES.includes(input.role)) return { error: "Invalid role." };
  const { tenantId, userId, role } = await requireActiveContext();
  if (role !== "owner" && role !== "admin") {
    return { error: "Only an owner or admin can manage users." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_memberships")
    .update({ role: input.role })
    .eq("tenant_id", tenantId)
    .eq("id", input.membershipId);
  if (error) return { error: error.message };

  logAudit({
    tenantId,
    userId,
    action: "member.role_changed",
    entityType: "membership",
    entityId: input.membershipId,
    data: { role: input.role },
  });
  revalidatePath("/users");
  return { ok: true };
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  const { tenantId, userId, role } = await requireActiveContext();
  if (role !== "owner" && role !== "admin") {
    return { error: "Only an owner or admin can manage users." };
  }

  const supabase = await createClient();
  // Never let the last owner be removed.
  const { data: member } = await supabase
    .from("aimunim_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("id", membershipId)
    .single();
  if (member?.role === "owner") {
    const { count } = await supabase
      .from("aimunim_memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) return { error: "Cannot remove the only owner." };
  }

  const { error } = await supabase
    .from("aimunim_memberships")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", membershipId);
  if (error) return { error: error.message };

  logAudit({
    tenantId,
    userId,
    action: "member.removed",
    entityType: "membership",
    entityId: membershipId,
  });
  revalidatePath("/users");
  return { ok: true };
}
