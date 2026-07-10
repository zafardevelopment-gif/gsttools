"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";

export type ActionResult = { ok?: true; error?: string };

const lineSchema = z.object({
  itemId: z.guid(),
  qty: z.coerce.number().positive(),
});

const recurringSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  partyId: z.guid({ error: "Select a party." }),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  nextRunDate: z.string().min(1),
  autoShare: z.boolean().default(true),
  lines: z.array(lineSchema).min(1, "Add at least one item."),
});

export async function createRecurringAction(
  input: z.input<typeof recurringSchema>,
): Promise<ActionResult> {
  const parsed = recurringSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  // Snapshot the item lines from the master so future price edits don't
  // silently change agreed recurring bills.
  const { data: items } = await supabase
    .from("aimunim_items")
    .select("id, name, hsn_sac, unit, sale_price_paise, tax_rate")
    .eq("tenant_id", tenantId)
    .in("id", v.lines.map((l) => l.itemId));
  const byId = new Map((items ?? []).map((i) => [i.id, i]));

  const snapshot = v.lines.map((l) => {
    const item = byId.get(l.itemId);
    if (!item) throw new Error("Item not found.");
    return {
      item_id: item.id,
      name: item.name,
      hsn_sac: item.hsn_sac,
      unit: item.unit,
      qty: l.qty,
      rate_paise: item.sale_price_paise,
      tax_rate: item.tax_rate,
    };
  });

  const { error } = await supabase.from("aimunim_recurring_invoices").insert({
    tenant_id: tenantId,
    party_id: v.partyId,
    name: v.name,
    frequency: v.frequency,
    next_run_date: v.nextRunDate,
    items: snapshot,
    auto_share: v.autoShare,
  });
  if (error) return { error: error.message };
  revalidatePath("/recurring");
  return { ok: true };
}

export async function toggleRecurringAction(input: {
  id: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_recurring_invoices")
    .update({ is_active: input.isActive })
    .eq("tenant_id", tenantId)
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/recurring");
  return { ok: true };
}

export async function deleteRecurringAction(id: string): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_recurring_invoices")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/recurring");
  return { ok: true };
}
