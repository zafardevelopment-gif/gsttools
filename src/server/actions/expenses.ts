"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { expenseFormSchema } from "@/lib/validation/expense";
import { rupeesToPaise } from "@/lib/money";

export type ActionResult = { ok?: true; error?: string };

function parse(formData: FormData) {
  return expenseFormSchema.safeParse({
    category: formData.get("category"),
    amount: formData.get("amount") ?? 0,
    expense_date: formData.get("expense_date"),
    payment_mode: formData.get("payment_mode") ?? "cash",
    partyId: (formData.get("partyId") as string) || null,
    notes: formData.get("notes") ?? undefined,
  });
}

export async function createExpenseAction(formData: FormData): Promise<ActionResult> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const { error } = await supabase.from("GST_expenses").insert({
    tenant_id: tenantId,
    category: v.category,
    amount_paise: rupeesToPaise(v.amount),
    expense_date: v.expense_date,
    payment_mode: v.payment_mode,
    party_id: v.partyId ?? null,
    notes: v.notes || null,
    created_by: userId,
  });
  if (error) return { error: error.message };
  revalidatePath("/expenses");
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("GST_expenses")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/expenses");
  return { ok: true };
}
