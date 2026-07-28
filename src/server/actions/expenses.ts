"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { expenseFormSchema } from "@/lib/validation/expense";
import { createExpense } from "@/server/services/expenses";

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

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  // Shared with the ingest API — see server/services/expenses.ts.
  const res = await createExpense({
    db: supabase,
    tenantId,
    userId,
    input: parsed.data,
    source: "ui",
  });
  if (res.error) return { error: res.error };

  revalidatePath("/expenses");
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_expenses")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/expenses");
  return { ok: true };
}
