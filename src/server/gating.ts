import "server-only";
import { getSubscription, getMonthlyInvoiceCount, planKeyOf } from "@/server/queries/subscription";
import { isSubscriptionActive, monthlyInvoiceLimit } from "@/lib/subscription";

export type GateResult = { ok: true } | { ok: false; error: string };

/**
 * Plan-based gating for creating a (non-draft) sale invoice:
 *  - subscription must be active (trial not expired, or paid).
 *  - monthly invoice count must be under the plan's cap.
 * Drafts bypass the cap so users aren't fully locked out.
 */
export async function canCreateInvoice(isDraft: boolean): Promise<GateResult> {
  const sub = await getSubscription();
  if (!sub) return { ok: true }; // no subscription row yet (pre-provision) — allow

  if (!isSubscriptionActive(sub)) {
    return {
      ok: false,
      error: "Your trial/subscription has expired. Please upgrade your plan to continue.",
    };
  }

  if (isDraft) return { ok: true };

  const plan = planKeyOf(sub);
  const limit = monthlyInvoiceLimit(plan);
  if (limit === Infinity) return { ok: true };

  const used = await getMonthlyInvoiceCount();
  if (used >= limit) {
    return {
      ok: false,
      error: `You've reached your ${plan} plan limit of ${limit} invoices this month. Upgrade to add more.`,
    };
  }
  return { ok: true };
}
