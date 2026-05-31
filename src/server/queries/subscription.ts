import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { currentMonthRange } from "@/server/queries/reports";
import type { SubscriptionRow } from "@/lib/database.types";
import type { PlanKey } from "@/lib/constants";

export async function getSubscription(): Promise<SubscriptionRow | null> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("GST_subscriptions")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

/** Count of non-draft sale invoices created this calendar month. */
export async function getMonthlyInvoiceCount(): Promise<number> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { from, to } = currentMonthRange();
  const { count } = await supabase
    .from("GST_invoices")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("direction", "sale")
    .neq("status", "draft")
    .gte("invoice_date", from)
    .lte("invoice_date", to);
  return count ?? 0;
}

export function planKeyOf(sub: SubscriptionRow | null): PlanKey {
  return (sub?.plan as PlanKey) ?? "trial";
}
