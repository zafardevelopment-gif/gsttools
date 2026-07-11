import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";

export type SalesPoint = { date: string; label: string; sales: number /* rupees */ };
export type ModeSlice = { mode: string; amount: number /* rupees */ };

export type DashboardCharts = {
  salesTrend: SalesPoint[]; // last 30 days, zero-filled
  paymentModes: ModeSlice[]; // this month, received only
};

export async function getDashboardCharts(): Promise<DashboardCharts> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const monthStart = fmt(today).slice(0, 8) + "01";

  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from("aimunim_invoices")
      .select("invoice_date, total_paise")
      .eq("tenant_id", tenantId)
      .eq("direction", "sale")
      .eq("voucher_type", "invoice")
      .neq("status", "draft")
      .gte("invoice_date", fmt(start)),
    supabase
      .from("aimunim_payments")
      .select("amount_paise, mode")
      .eq("tenant_id", tenantId)
      .eq("direction", "in")
      .gte("payment_date", monthStart),
  ]);

  const byDate = new Map<string, number>();
  for (const i of invoices ?? []) {
    byDate.set(i.invoice_date, (byDate.get(i.invoice_date) ?? 0) + i.total_paise);
  }
  const salesTrend: SalesPoint[] = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = fmt(d);
    salesTrend.push({
      date: key,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      sales: Math.round((byDate.get(key) ?? 0) / 100),
    });
  }

  const byMode = new Map<string, number>();
  for (const p of payments ?? []) {
    byMode.set(p.mode, (byMode.get(p.mode) ?? 0) + p.amount_paise);
  }
  const paymentModes = [...byMode.entries()]
    .map(([mode, paise]) => ({ mode, amount: Math.round(paise / 100) }))
    .sort((a, b) => b.amount - a.amount);

  return { salesTrend, paymentModes };
}
