import "server-only";
import { expenseFormSchema, type ExpenseFormInput } from "@/lib/validation/expense";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/server/audit";
import type { DbClient } from "@/server/services/invoices";

/** Expense recording service — shared by the UI action and the ingest API. */

export type CreateExpenseResult = { id?: string; error?: string };

export async function createExpense(params: {
  db: DbClient;
  tenantId: string;
  userId?: string | null;
  input: ExpenseFormInput;
  source?: string;
}): Promise<CreateExpenseResult> {
  const parsed = expenseFormSchema.safeParse(params.input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid expense." };
  }
  const v = parsed.data;

  const { data, error } = await params.db
    .from("aimunim_expenses")
    .insert({
      tenant_id: params.tenantId,
      category: v.category,
      amount_paise: rupeesToPaise(v.amount),
      expense_date: v.expense_date,
      payment_mode: v.payment_mode,
      party_id: v.partyId ?? null,
      notes: v.notes || null,
      created_by: params.userId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not record expense." };

  logAudit({
    tenantId: params.tenantId,
    userId: params.userId ?? null,
    action: "expense.created",
    entityType: "expense",
    entityId: data.id,
    data: { category: v.category, source: params.source ?? "ui" },
  });

  return { id: data.id };
}
