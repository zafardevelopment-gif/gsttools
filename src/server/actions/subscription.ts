"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { PLANS, type PlanKey } from "@/lib/constants";

export type ActionResult = { ok?: true; error?: string };

/**
 * Change the tenant's plan.
 *
 * STUB: with Razorpay not wired, this immediately activates the chosen plan
 * (a "demo upgrade"). When Razorpay is configured, gate this behind a verified
 * payment / webhook instead of flipping the plan directly.
 */
export async function changePlanAction(plan: PlanKey): Promise<ActionResult> {
  if (!(plan in PLANS)) return { error: "Unknown plan." };
  const { tenantId, role } = await requireActiveContext();
  if (role !== "owner" && role !== "admin") {
    return { error: "Only an owner or admin can change the plan." };
  }
  const supabase = await createClient();

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const isTrial = plan === "trial";
  const { error } = await supabase
    .from("GST_subscriptions")
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
  if (error) return { error: error.message };

  // Keep the denormalised tenant.plan in sync (used for quick gating/display).
  await supabase.from("GST_tenants").update({ plan }).eq("id", tenantId);

  revalidatePath("/subscription");
  revalidatePath("/dashboard");
  return { ok: true };
}
