import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import type { ReportResult } from "./reports";

// =============================================================================
// Extended reports (spec Module 7): GST, financial and party reports.
// =============================================================================

/**
 * GSTR-1 — outward supplies (sales) for the period, B2B vs B2C, with credit
 * notes / sales returns shown as negative rows (GSTR-1 CDNR section style).
 */
export async function gstr1Report(from: string, to: string): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("aimunim_invoices")
    .select(
      "invoice_number, invoice_date, party_id, voucher_type, place_of_supply_state, taxable_value_paise, cgst_paise, sgst_paise, igst_paise, total_paise",
    )
    .eq("tenant_id", tenantId)
    .eq("direction", "sale")
    .eq("invoice_type", "gst")
    .in("voucher_type", ["invoice", "credit_note", "sales_return"])
    .neq("status", "draft")
    .gte("invoice_date", from)
    .lte("invoice_date", to)
    .order("invoice_date", { ascending: true });

  const partyIds = [...new Set((invoices ?? []).map((i) => i.party_id).filter(Boolean))] as string[];
  const parties = new Map<string, { name: string; gstin: string | null }>();
  if (partyIds.length) {
    const { data } = await supabase
      .from("aimunim_parties")
      .select("id, name, gstin")
      .in("id", partyIds);
    (data ?? []).forEach((p) => parties.set(p.id, { name: p.name, gstin: p.gstin }));
  }

  const rows = (invoices ?? []).map((i) => {
    const party = i.party_id ? parties.get(i.party_id) : undefined;
    const sign = i.voucher_type === "invoice" ? 1 : -1;
    return {
      section: party?.gstin ? "B2B" : "B2C",
      gstin: party?.gstin ?? "—",
      party: party?.name ?? "Cash",
      invoice_number: i.invoice_number,
      invoice_date: i.invoice_date,
      pos: i.place_of_supply_state ?? "—",
      taxable_value_paise: sign * i.taxable_value_paise,
      cgst_paise: sign * i.cgst_paise,
      sgst_paise: sign * i.sgst_paise,
      igst_paise: sign * i.igst_paise,
      total_paise: sign * i.total_paise,
    };
  });

  return {
    title: "GSTR-1 (Sales)",
    columns: [
      { key: "section", label: "Section" },
      { key: "gstin", label: "GSTIN" },
      { key: "party", label: "Party" },
      { key: "invoice_number", label: "Number" },
      { key: "invoice_date", label: "Date" },
      { key: "pos", label: "POS" },
      { key: "taxable_value_paise", label: "Taxable", numeric: true },
      { key: "cgst_paise", label: "CGST", numeric: true },
      { key: "sgst_paise", label: "SGST", numeric: true },
      { key: "igst_paise", label: "IGST", numeric: true },
      { key: "total_paise", label: "Total", numeric: true },
    ],
    rows,
    totals: {
      taxable_value_paise: rows.reduce((s, r) => s + r.taxable_value_paise, 0),
      cgst_paise: rows.reduce((s, r) => s + r.cgst_paise, 0),
      sgst_paise: rows.reduce((s, r) => s + r.sgst_paise, 0),
      igst_paise: rows.reduce((s, r) => s + r.igst_paise, 0),
      total_paise: rows.reduce((s, r) => s + r.total_paise, 0),
    },
  };
}

/** GSTR-3B — period summary: outward liability vs eligible ITC (purchases). */
export async function gstr3bReport(from: string, to: string): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("aimunim_invoices")
    .select("direction, voucher_type, taxable_value_paise, cgst_paise, sgst_paise, igst_paise")
    .eq("tenant_id", tenantId)
    .eq("invoice_type", "gst")
    .in("voucher_type", [
      "invoice",
      "credit_note",
      "sales_return",
      "debit_note",
      "purchase_return",
    ])
    .neq("status", "draft")
    .gte("invoice_date", from)
    .lte("invoice_date", to);

  const acc = {
    out: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
    itc: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
  };
  for (const i of invoices ?? []) {
    const bucket = i.direction === "sale" ? acc.out : acc.itc;
    const sign = i.voucher_type === "invoice" ? 1 : -1;
    bucket.taxable += sign * i.taxable_value_paise;
    bucket.cgst += sign * i.cgst_paise;
    bucket.sgst += sign * i.sgst_paise;
    bucket.igst += sign * i.igst_paise;
  }

  const rows = [
    {
      section: "3.1(a) Outward taxable supplies",
      taxable_paise: acc.out.taxable,
      cgst_paise: acc.out.cgst,
      sgst_paise: acc.out.sgst,
      igst_paise: acc.out.igst,
    },
    {
      section: "4(A) Eligible ITC (purchases)",
      taxable_paise: acc.itc.taxable,
      cgst_paise: acc.itc.cgst,
      sgst_paise: acc.itc.sgst,
      igst_paise: acc.itc.igst,
    },
    {
      section: "Net tax payable (outward − ITC)",
      taxable_paise: 0,
      cgst_paise: acc.out.cgst - acc.itc.cgst,
      sgst_paise: acc.out.sgst - acc.itc.sgst,
      igst_paise: acc.out.igst - acc.itc.igst,
    },
  ];

  return {
    title: "GSTR-3B summary",
    columns: [
      { key: "section", label: "Section" },
      { key: "taxable_paise", label: "Taxable", numeric: true },
      { key: "cgst_paise", label: "CGST", numeric: true },
      { key: "sgst_paise", label: "SGST", numeric: true },
      { key: "igst_paise", label: "IGST", numeric: true },
    ],
    rows,
  };
}

/** HSN-wise sales summary (GSTR-1 table 12 style). */
export async function hsnSalesReport(from: string, to: string): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const columns = [
    { key: "hsn", label: "HSN/SAC" },
    { key: "qty", label: "Qty" },
    { key: "taxable_paise", label: "Taxable", numeric: true },
    { key: "tax_paise", label: "Tax", numeric: true },
    { key: "total_paise", label: "Total", numeric: true },
  ];

  const { data: invoices } = await supabase
    .from("aimunim_invoices")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("direction", "sale")
    .eq("voucher_type", "invoice")
    .neq("status", "draft")
    .gte("invoice_date", from)
    .lte("invoice_date", to);
  const ids = (invoices ?? []).map((i) => i.id);
  if (!ids.length) return { title: "HSN-wise sales", columns, rows: [] };

  const { data: lines } = await supabase
    .from("aimunim_invoice_items")
    .select("hsn_sac, qty, taxable_value_paise, cgst_paise, sgst_paise, igst_paise, amount_paise")
    .eq("tenant_id", tenantId)
    .in("invoice_id", ids);

  const byHsn = new Map<string, { qty: number; taxable: number; tax: number; total: number }>();
  for (const l of lines ?? []) {
    const key = l.hsn_sac?.trim() || "(no HSN)";
    const agg = byHsn.get(key) ?? { qty: 0, taxable: 0, tax: 0, total: 0 };
    agg.qty += l.qty;
    agg.taxable += l.taxable_value_paise;
    agg.tax += l.cgst_paise + l.sgst_paise + l.igst_paise;
    agg.total += l.amount_paise;
    byHsn.set(key, agg);
  }

  const rows = [...byHsn.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([hsn, v]) => ({
      hsn,
      qty: v.qty,
      taxable_paise: v.taxable,
      tax_paise: v.tax,
      total_paise: v.total,
    }));

  return {
    title: "HSN-wise sales",
    columns,
    rows,
    totals: {
      taxable_paise: rows.reduce((s, r) => s + r.taxable_paise, 0),
      tax_paise: rows.reduce((s, r) => s + r.tax_paise, 0),
      total_paise: rows.reduce((s, r) => s + r.total_paise, 0),
    },
  };
}

/** Profit & Loss (basic): net sales − net purchases − expenses. */
export async function profitLossReport(from: string, to: string): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const [{ data: invoices }, { data: expenses }] = await Promise.all([
    supabase
      .from("aimunim_invoices")
      .select("direction, voucher_type, total_paise")
      .eq("tenant_id", tenantId)
      .in("voucher_type", [
        "invoice",
        "sales_return",
        "credit_note",
        "purchase_return",
        "debit_note",
      ])
      .neq("status", "draft")
      .gte("invoice_date", from)
      .lte("invoice_date", to),
    supabase
      .from("aimunim_expenses")
      .select("amount_paise")
      .eq("tenant_id", tenantId)
      .gte("expense_date", from)
      .lte("expense_date", to),
  ]);

  let sales = 0;
  let saleReturns = 0;
  let purchases = 0;
  let purchaseReturns = 0;
  for (const i of invoices ?? []) {
    if (i.direction === "sale") {
      if (i.voucher_type === "invoice") sales += i.total_paise;
      else saleReturns += i.total_paise;
    } else {
      if (i.voucher_type === "invoice") purchases += i.total_paise;
      else purchaseReturns += i.total_paise;
    }
  }
  const totalExpenses = (expenses ?? []).reduce((s, e) => s + e.amount_paise, 0);
  const netSales = sales - saleReturns;
  const netPurchases = purchases - purchaseReturns;
  const grossProfit = netSales - netPurchases;

  const rows = [
    { particulars: "Sales", amount_paise: sales },
    { particulars: "Less: Sales returns / credit notes", amount_paise: -saleReturns },
    { particulars: "Net sales", amount_paise: netSales },
    { particulars: "Purchases", amount_paise: purchases },
    { particulars: "Less: Purchase returns / debit notes", amount_paise: -purchaseReturns },
    { particulars: "Net purchases", amount_paise: netPurchases },
    { particulars: "Gross profit", amount_paise: grossProfit },
    { particulars: "Less: Expenses", amount_paise: -totalExpenses },
    { particulars: "NET PROFIT / (LOSS)", amount_paise: grossProfit - totalExpenses },
  ];

  return {
    title: "Profit & Loss",
    columns: [
      { key: "particulars", label: "Particulars" },
      { key: "amount_paise", label: "Amount", numeric: true },
    ],
    rows,
  };
}

/** Daybook — every money-touching entry in the period, chronological. */
export async function daybookReport(from: string, to: string): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const [{ data: invoices }, { data: payments }, { data: expenses }, { data: txns }] =
    await Promise.all([
      supabase
        .from("aimunim_invoices")
        .select("invoice_date, invoice_number, direction, voucher_type, party_id, total_paise")
        .eq("tenant_id", tenantId)
        .neq("status", "draft")
        .gte("invoice_date", from)
        .lte("invoice_date", to),
      supabase
        .from("aimunim_payments")
        .select("payment_date, direction, mode, party_id, amount_paise, reference")
        .eq("tenant_id", tenantId)
        .gte("payment_date", from)
        .lte("payment_date", to),
      supabase
        .from("aimunim_expenses")
        .select("expense_date, category, amount_paise")
        .eq("tenant_id", tenantId)
        .gte("expense_date", from)
        .lte("expense_date", to),
      supabase
        .from("aimunim_cashbank_txns")
        .select("txn_date, direction, kind, amount_paise, notes")
        .eq("tenant_id", tenantId)
        .gte("txn_date", from)
        .lte("txn_date", to),
    ]);

  const partyIds = [
    ...new Set(
      [...(invoices ?? []), ...(payments ?? [])].map((r) => r.party_id).filter(Boolean),
    ),
  ] as string[];
  const names = new Map<string, string>();
  if (partyIds.length) {
    const { data } = await supabase.from("aimunim_parties").select("id, name").in("id", partyIds);
    (data ?? []).forEach((p) => names.set(p.id, p.name));
  }

  type Row = {
    date: string;
    type: string;
    ref: string;
    party: string;
    in_paise: number;
    out_paise: number;
  };
  const rows: Row[] = [];

  for (const i of invoices ?? []) {
    const isIn = i.direction === "sale" && i.voucher_type === "invoice";
    const isOut = i.direction === "purchase" && i.voucher_type === "invoice";
    rows.push({
      date: i.invoice_date,
      type:
        i.voucher_type === "invoice"
          ? i.direction === "sale"
            ? "Sale"
            : "Purchase"
          : i.voucher_type.replace(/_/g, " "),
      ref: i.invoice_number,
      party: i.party_id ? (names.get(i.party_id) ?? "—") : "Cash",
      in_paise: isIn ? i.total_paise : 0,
      out_paise: isOut ? i.total_paise : 0,
    });
  }
  for (const p of payments ?? []) {
    rows.push({
      date: p.payment_date,
      type: p.direction === "in" ? "Payment In" : "Payment Out",
      ref: p.reference ?? p.mode.toUpperCase(),
      party: p.party_id ? (names.get(p.party_id) ?? "—") : "—",
      in_paise: p.direction === "in" ? p.amount_paise : 0,
      out_paise: p.direction === "out" ? p.amount_paise : 0,
    });
  }
  for (const e of expenses ?? []) {
    rows.push({
      date: e.expense_date,
      type: "Expense",
      ref: e.category,
      party: "—",
      in_paise: 0,
      out_paise: e.amount_paise,
    });
  }
  for (const t of txns ?? []) {
    rows.push({
      date: t.txn_date,
      type: t.kind === "transfer" ? "Transfer" : "Cash/Bank Adj.",
      ref: t.notes ?? "—",
      party: "—",
      in_paise: t.direction === "in" ? t.amount_paise : 0,
      out_paise: t.direction === "out" ? t.amount_paise : 0,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  return {
    title: "Daybook",
    columns: [
      { key: "date", label: "Date" },
      { key: "type", label: "Type" },
      { key: "ref", label: "Ref" },
      { key: "party", label: "Party" },
      { key: "in_paise", label: "In", numeric: true },
      { key: "out_paise", label: "Out", numeric: true },
    ],
    rows,
    totals: {
      in_paise: rows.reduce((s, r) => s + r.in_paise, 0),
      out_paise: rows.reduce((s, r) => s + r.out_paise, 0),
    },
  };
}

/** Receivable ageing — customer dues bucketed by invoice age. */
export async function ageingReport(): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("aimunim_invoices")
    .select("party_id, invoice_date, due_date, total_paise, amount_paid_paise")
    .eq("tenant_id", tenantId)
    .eq("direction", "sale")
    .eq("voucher_type", "invoice")
    .in("status", ["unpaid", "partial"]);

  const partyIds = [...new Set((invoices ?? []).map((i) => i.party_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (partyIds.length) {
    const { data } = await supabase.from("aimunim_parties").select("id, name").in("id", partyIds);
    (data ?? []).forEach((p) => names.set(p.id, p.name));
  }

  type Buckets = { b0: number; b31: number; b61: number; b90: number };
  const byParty = new Map<string, Buckets>();
  const now = Date.now();

  for (const i of invoices ?? []) {
    const due = i.total_paise - i.amount_paid_paise;
    if (due <= 0) continue;
    const key = i.party_id ?? "cash";
    const base = i.due_date ?? i.invoice_date;
    const ageDays = Math.floor((now - new Date(base).getTime()) / 86_400_000);
    const b = byParty.get(key) ?? { b0: 0, b31: 0, b61: 0, b90: 0 };
    if (ageDays <= 30) b.b0 += due;
    else if (ageDays <= 60) b.b31 += due;
    else if (ageDays <= 90) b.b61 += due;
    else b.b90 += due;
    byParty.set(key, b);
  }

  const rows = [...byParty.entries()]
    .map(([partyId, b]) => ({
      party: partyId === "cash" ? "Cash" : (names.get(partyId) ?? "—"),
      b0_paise: b.b0,
      b31_paise: b.b31,
      b61_paise: b.b61,
      b90_paise: b.b90,
      total_paise: b.b0 + b.b31 + b.b61 + b.b90,
    }))
    .sort((a, b) => b.total_paise - a.total_paise);

  return {
    title: "Receivable ageing",
    columns: [
      { key: "party", label: "Party" },
      { key: "b0_paise", label: "0–30 days", numeric: true },
      { key: "b31_paise", label: "31–60", numeric: true },
      { key: "b61_paise", label: "61–90", numeric: true },
      { key: "b90_paise", label: "90+", numeric: true },
      { key: "total_paise", label: "Total due", numeric: true },
    ],
    rows,
    totals: {
      b0_paise: rows.reduce((s, r) => s + r.b0_paise, 0),
      b31_paise: rows.reduce((s, r) => s + r.b31_paise, 0),
      b61_paise: rows.reduce((s, r) => s + r.b61_paise, 0),
      b90_paise: rows.reduce((s, r) => s + r.b90_paise, 0),
      total_paise: rows.reduce((s, r) => s + r.total_paise, 0),
    },
  };
}

/**
 * Balance Sheet (basic, as-of-today): current assets (cash, bank, receivables,
 * stock) vs liabilities (payables), balanced by owner's equity (the residual).
 */
export async function balanceSheetReport(): Promise<ReportResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const [
    { data: parties },
    { data: items },
    { data: accounts },
    { data: txns },
    { data: payments },
    { data: expenses },
  ] = await Promise.all([
    supabase.from("aimunim_parties").select("balance_paise").eq("tenant_id", tenantId),
    supabase
      .from("aimunim_items")
      .select("stock_qty, purchase_price_paise, type")
      .eq("tenant_id", tenantId)
      .eq("type", "product"),
    supabase
      .from("aimunim_bank_accounts")
      .select("id, opening_balance_paise")
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    supabase
      .from("aimunim_cashbank_txns")
      .select("account_id, direction, amount_paise")
      .eq("tenant_id", tenantId),
    supabase
      .from("aimunim_payments")
      .select("direction, amount_paise, mode, bank_account_id")
      .eq("tenant_id", tenantId),
    supabase
      .from("aimunim_expenses")
      .select("amount_paise, payment_mode")
      .eq("tenant_id", tenantId),
  ]);

  const receivables = (parties ?? [])
    .filter((p) => p.balance_paise > 0)
    .reduce((s, p) => s + p.balance_paise, 0);
  const payables = (parties ?? [])
    .filter((p) => p.balance_paise < 0)
    .reduce((s, p) => s - p.balance_paise, 0);
  const stockValue = (items ?? []).reduce(
    (s, i) => s + Math.round(i.stock_qty * i.purchase_price_paise),
    0,
  );

  const txnSum = (accountId: string | null) =>
    (txns ?? [])
      .filter((t) => t.account_id === accountId)
      .reduce((s, t) => s + (t.direction === "in" ? t.amount_paise : -t.amount_paise), 0);

  const bankBalance = (accounts ?? []).reduce((sum, a) => {
    const paymentSum = (payments ?? [])
      .filter((p) => p.bank_account_id === a.id)
      .reduce((s, p) => s + (p.direction === "in" ? p.amount_paise : -p.amount_paise), 0);
    return sum + a.opening_balance_paise + txnSum(a.id) + paymentSum;
  }, 0);

  const cashPayments = (payments ?? [])
    .filter((p) => p.mode === "cash" && !p.bank_account_id)
    .reduce((s, p) => s + (p.direction === "in" ? p.amount_paise : -p.amount_paise), 0);
  const cashExpenses = (expenses ?? [])
    .filter((e) => e.payment_mode === "cash")
    .reduce((s, e) => s + e.amount_paise, 0);
  const cashBalance = txnSum(null) + cashPayments - cashExpenses;

  const totalAssets = cashBalance + bankBalance + receivables + stockValue;
  const equity = totalAssets - payables; // residual = capital + retained earnings

  const rows = [
    { particulars: "ASSETS", amount_paise: 0 },
    { particulars: "Cash in hand", amount_paise: cashBalance },
    { particulars: "Bank accounts", amount_paise: bankBalance },
    { particulars: "Receivables (sundry debtors)", amount_paise: receivables },
    { particulars: "Closing stock (at cost)", amount_paise: stockValue },
    { particulars: "Total assets", amount_paise: totalAssets },
    { particulars: "LIABILITIES & EQUITY", amount_paise: 0 },
    { particulars: "Payables (sundry creditors)", amount_paise: payables },
    { particulars: "Owner's equity (residual)", amount_paise: equity },
    { particulars: "Total liabilities + equity", amount_paise: totalAssets },
  ];

  return {
    title: "Balance Sheet (as of today)",
    columns: [
      { key: "particulars", label: "Particulars" },
      { key: "amount_paise", label: "Amount", numeric: true },
    ],
    rows,
  };
}
