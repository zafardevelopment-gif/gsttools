import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";

/** First and last day of the current month as YYYY-MM-DD. */
export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

const today = () => new Date().toISOString().slice(0, 10);

export type DashboardStats = {
  todaySalesPaise: number;
  monthSalesPaise: number;
  todayCollectionPaise: number;
  receivablesPaise: number;
  payablesPaise: number;
  stockValuePaise: number;
  monthExpensesPaise: number;
  lowStock: { id: string; name: string; stock_qty: number; unit: string }[];
  recentInvoices: {
    id: string;
    invoice_number: string;
    invoice_date: string;
    total_paise: number;
    status: string;
  }[];
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { from, to } = currentMonthRange();
  const td = today();

  const [
    { data: saleInvoices },
    { data: parties },
    { data: items },
    { data: expenses },
    { data: payments },
    { data: recent },
  ] = await Promise.all([
    supabase
      .from("GST_invoices")
      .select("invoice_date, total_paise")
      .eq("tenant_id", tenantId)
      .eq("direction", "sale")
      .neq("status", "draft")
      .gte("invoice_date", from)
      .lte("invoice_date", to),
    supabase.from("GST_parties").select("balance_paise").eq("tenant_id", tenantId),
    supabase
      .from("GST_items")
      .select("id, name, stock_qty, unit, low_stock_level, purchase_price_paise, type")
      .eq("tenant_id", tenantId)
      .eq("type", "product"),
    supabase
      .from("GST_expenses")
      .select("amount_paise")
      .eq("tenant_id", tenantId)
      .gte("expense_date", from)
      .lte("expense_date", to),
    supabase
      .from("GST_payments")
      .select("amount_paise, direction, payment_date")
      .eq("tenant_id", tenantId)
      .eq("direction", "in")
      .eq("payment_date", td),
    supabase
      .from("GST_invoices")
      .select("id, invoice_number, invoice_date, total_paise, status")
      .eq("tenant_id", tenantId)
      .eq("direction", "sale")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const monthSalesPaise = (saleInvoices ?? []).reduce((s, i) => s + i.total_paise, 0);
  const todaySalesPaise = (saleInvoices ?? [])
    .filter((i) => i.invoice_date === td)
    .reduce((s, i) => s + i.total_paise, 0);
  const receivablesPaise = (parties ?? [])
    .filter((p) => p.balance_paise > 0)
    .reduce((s, p) => s + p.balance_paise, 0);
  const payablesPaise = (parties ?? [])
    .filter((p) => p.balance_paise < 0)
    .reduce((s, p) => s - p.balance_paise, 0);
  const stockValuePaise = (items ?? []).reduce(
    (s, i) => s + Math.round(i.stock_qty * i.purchase_price_paise),
    0,
  );
  const monthExpensesPaise = (expenses ?? []).reduce((s, e) => s + e.amount_paise, 0);
  const todayCollectionPaise = (payments ?? []).reduce((s, p) => s + p.amount_paise, 0);
  const lowStock = (items ?? [])
    .filter((i) => i.stock_qty <= i.low_stock_level)
    .map((i) => ({ id: i.id, name: i.name, stock_qty: i.stock_qty, unit: i.unit }));

  return {
    todaySalesPaise,
    monthSalesPaise,
    todayCollectionPaise,
    receivablesPaise,
    payablesPaise,
    stockValuePaise,
    monthExpensesPaise,
    lowStock,
    recentInvoices: recent ?? [],
  };
}

// ---- Tabular reports --------------------------------------------------------

export type ReportColumn = { key: string; label: string; numeric?: boolean };
export type ReportResult = {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  /** Paise totals keyed by column for the footer + exports. */
  totals?: Record<string, number>;
};

async function invoiceReport(
  direction: "sale" | "purchase",
  from: string,
  to: string,
): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("GST_invoices")
    .select("invoice_number, invoice_date, party_id, taxable_value_paise, total_tax_paise, total_paise, status")
    .eq("tenant_id", tenantId)
    .eq("direction", direction)
    .neq("status", "draft")
    .gte("invoice_date", from)
    .lte("invoice_date", to)
    .order("invoice_date", { ascending: true });

  const partyIds = [...new Set((invoices ?? []).map((i) => i.party_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (partyIds.length) {
    const { data } = await supabase.from("GST_parties").select("id, name").in("id", partyIds);
    (data ?? []).forEach((p) => names.set(p.id, p.name));
  }

  const rows = (invoices ?? []).map((i) => ({
    invoice_number: i.invoice_number,
    invoice_date: i.invoice_date,
    party: i.party_id ? names.get(i.party_id) ?? "—" : "Cash",
    taxable_value_paise: i.taxable_value_paise,
    total_tax_paise: i.total_tax_paise,
    total_paise: i.total_paise,
    status: i.status,
  }));

  const totals = {
    taxable_value_paise: rows.reduce((s, r) => s + r.taxable_value_paise, 0),
    total_tax_paise: rows.reduce((s, r) => s + r.total_tax_paise, 0),
    total_paise: rows.reduce((s, r) => s + r.total_paise, 0),
  };

  return {
    title: direction === "sale" ? "Sales report" : "Purchase report",
    columns: [
      { key: "invoice_number", label: "Number" },
      { key: "invoice_date", label: "Date" },
      { key: "party", label: "Party" },
      { key: "taxable_value_paise", label: "Taxable", numeric: true },
      { key: "total_tax_paise", label: "Tax", numeric: true },
      { key: "total_paise", label: "Total", numeric: true },
      { key: "status", label: "Status" },
    ],
    rows,
    totals,
  };
}

export const salesReport = (from: string, to: string) => invoiceReport("sale", from, to);
export const purchaseReport = (from: string, to: string) =>
  invoiceReport("purchase", from, to);

export async function outstandingReport(): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data: parties } = await supabase
    .from("GST_parties")
    .select("name, type, balance_paise")
    .eq("tenant_id", tenantId)
    .neq("balance_paise", 0)
    .order("balance_paise", { ascending: false });

  const rows = (parties ?? []).map((p) => ({
    name: p.name,
    type: p.type,
    receivable_paise: p.balance_paise > 0 ? p.balance_paise : 0,
    payable_paise: p.balance_paise < 0 ? -p.balance_paise : 0,
  }));

  return {
    title: "Outstanding report",
    columns: [
      { key: "name", label: "Party" },
      { key: "type", label: "Type" },
      { key: "receivable_paise", label: "Receivable", numeric: true },
      { key: "payable_paise", label: "Payable", numeric: true },
    ],
    rows,
    totals: {
      receivable_paise: rows.reduce((s, r) => s + r.receivable_paise, 0),
      payable_paise: rows.reduce((s, r) => s + r.payable_paise, 0),
    },
  };
}

export async function stockReport(): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("GST_items")
    .select("name, unit, stock_qty, low_stock_level, purchase_price_paise")
    .eq("tenant_id", tenantId)
    .eq("type", "product")
    .order("name", { ascending: true });

  const rows = (items ?? []).map((i) => ({
    name: i.name,
    stock_qty: i.stock_qty,
    unit: i.unit,
    low: i.stock_qty <= i.low_stock_level ? "LOW" : "",
    value_paise: Math.round(i.stock_qty * i.purchase_price_paise),
  }));

  return {
    title: "Stock summary",
    columns: [
      { key: "name", label: "Item" },
      { key: "stock_qty", label: "Qty" },
      { key: "unit", label: "Unit" },
      { key: "low", label: "Alert" },
      { key: "value_paise", label: "Stock value", numeric: true },
    ],
    rows,
    totals: { value_paise: rows.reduce((s, r) => s + r.value_paise, 0) },
  };
}

export async function expenseReport(from: string, to: string): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data: expenses } = await supabase
    .from("GST_expenses")
    .select("expense_date, category, payment_mode, amount_paise, notes")
    .eq("tenant_id", tenantId)
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("expense_date", { ascending: true });

  const rows = (expenses ?? []).map((e) => ({
    expense_date: e.expense_date,
    category: e.category,
    payment_mode: e.payment_mode,
    amount_paise: e.amount_paise,
    notes: e.notes ?? "",
  }));

  return {
    title: "Expense report",
    columns: [
      { key: "expense_date", label: "Date" },
      { key: "category", label: "Category" },
      { key: "payment_mode", label: "Mode" },
      { key: "amount_paise", label: "Amount", numeric: true },
      { key: "notes", label: "Notes" },
    ],
    rows,
    totals: { amount_paise: rows.reduce((s, r) => s + r.amount_paise, 0) },
  };
}
