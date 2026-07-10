import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import type { StaffRow, PayslipRow } from "@/lib/database.types";

export type StaffListRow = StaffRow & {
  /** Today's attendance status, if marked. */
  today_status: string | null;
  /** Outstanding advance/loan balance (advances+loans − repayments). */
  advance_balance_paise: number;
  /** Latest generated payslip, if any. */
  latest_payslip: PayslipRow | null;
};

export async function listStaff(): Promise<StaffListRow[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: staff }, { data: attendance }, { data: ledger }, { data: payslips }] =
    await Promise.all([
      supabase
        .from("aimunim_staff")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("aimunim_attendance")
        .select("staff_id, status")
        .eq("tenant_id", tenantId)
        .eq("day", today),
      supabase
        .from("aimunim_staff_ledger")
        .select("staff_id, kind, amount_paise")
        .eq("tenant_id", tenantId),
      supabase
        .from("aimunim_payslips")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("month", { ascending: false }),
    ]);

  const todayByStaff = new Map((attendance ?? []).map((a) => [a.staff_id, a.status]));
  const latestPayslipByStaff = new Map<string, PayslipRow>();
  for (const p of payslips ?? []) {
    if (!latestPayslipByStaff.has(p.staff_id)) latestPayslipByStaff.set(p.staff_id, p);
  }

  const advanceByStaff = new Map<string, number>();
  for (const l of ledger ?? []) {
    const sign = l.kind === "advance" || l.kind === "loan" ? 1 : l.kind === "repayment" ? -1 : 0;
    if (sign === 0) continue;
    advanceByStaff.set(
      l.staff_id,
      (advanceByStaff.get(l.staff_id) ?? 0) + sign * l.amount_paise,
    );
  }

  return (staff ?? []).map((s) => ({
    ...s,
    today_status: todayByStaff.get(s.id) ?? null,
    advance_balance_paise: advanceByStaff.get(s.id) ?? 0,
    latest_payslip: latestPayslipByStaff.get(s.id) ?? null,
  }));
}
