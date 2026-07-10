import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import type { ExpenseRow } from "@/lib/database.types";

export async function listExpenses(opts?: {
  from?: string;
  to?: string;
}): Promise<ExpenseRow[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  let q = supabase
    .from("aimunim_expenses")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("expense_date", { ascending: false });
  if (opts?.from) q = q.gte("expense_date", opts.from);
  if (opts?.to) q = q.lte("expense_date", opts.to);
  const { data } = await q;
  return data ?? [];
}

export function sumExpensesByCategory(expenses: ExpenseRow[]): {
  category: string;
  totalPaise: number;
}[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount_paise);
  }
  return [...map.entries()]
    .map(([category, totalPaise]) => ({ category, totalPaise }))
    .sort((a, b) => b.totalPaise - a.totalPaise);
}
