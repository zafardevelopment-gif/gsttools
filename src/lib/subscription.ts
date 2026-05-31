/**
 * Pure subscription/plan helpers (no I/O).
 */
import { PLANS, type PlanKey } from "@/lib/constants";

export function planLimits(plan: PlanKey) {
  return PLANS[plan].limits;
}

/** Whole days left until `endIso` from `now` (0 if past). */
export function daysLeft(endIso: string | null, now: Date = new Date()): number {
  if (!endIso) return 0;
  const end = new Date(endIso).getTime();
  const diff = end - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export type SubscriptionLike = {
  plan: PlanKey;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

/**
 * Can this tenant use paid features / create invoices?
 *  - 'active' => yes (paid).
 *  - 'trialing' => yes until trial_ends_at.
 *  - anything else (expired/canceled/past_due) => no.
 */
export function isSubscriptionActive(
  sub: SubscriptionLike,
  now: Date = new Date(),
): boolean {
  if (sub.status === "active") {
    // If a period end is set, respect it; otherwise treat as active.
    return !sub.current_period_end || new Date(sub.current_period_end).getTime() > now.getTime();
  }
  if (sub.status === "trialing") {
    return daysLeft(sub.trial_ends_at, now) > 0;
  }
  return false;
}

/** Monthly invoice cap for the plan (Infinity for unlimited). */
export function monthlyInvoiceLimit(plan: PlanKey): number {
  return PLANS[plan].limits.invoicesPerMonth;
}
