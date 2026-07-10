import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import type { PaymentRow, InvoiceRow, PartyRow } from "@/lib/database.types";

export type PaymentListRow = PaymentRow & {
  party_name: string | null;
  invoice_number: string | null;
};

export async function listPayments(): Promise<PaymentListRow[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data: payments } = await supabase
    .from("aimunim_payments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (!payments?.length) return [];

  const partyIds = [...new Set(payments.map((p) => p.party_id).filter(Boolean))] as string[];
  const invIds = [...new Set(payments.map((p) => p.invoice_id).filter(Boolean))] as string[];

  const partyNames = new Map<string, string>();
  const invNumbers = new Map<string, string>();
  if (partyIds.length) {
    const { data } = await supabase.from("aimunim_parties").select("id, name").in("id", partyIds);
    (data ?? []).forEach((p) => partyNames.set(p.id, p.name));
  }
  if (invIds.length) {
    const { data } = await supabase
      .from("aimunim_invoices")
      .select("id, invoice_number")
      .in("id", invIds);
    (data ?? []).forEach((i) => invNumbers.set(i.id, i.invoice_number));
  }

  return payments.map((p) => ({
    ...p,
    party_name: p.party_id ? partyNames.get(p.party_id) ?? null : null,
    invoice_number: p.invoice_id ? invNumbers.get(p.invoice_id) ?? null : null,
  }));
}

/** Open invoices for a party in the given direction (for payment allocation). */
export async function getOpenInvoicesForParty(
  partyId: string,
  paymentDirection: "in" | "out",
): Promise<Pick<InvoiceRow, "id" | "invoice_number" | "total_paise" | "amount_paid_paise">[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const invDirection = paymentDirection === "in" ? "sale" : "purchase";
  const { data } = await supabase
    .from("aimunim_invoices")
    .select("id, invoice_number, total_paise, amount_paid_paise, status")
    .eq("tenant_id", tenantId)
    .eq("party_id", partyId)
    .eq("direction", invDirection)
    .neq("status", "draft")
    .neq("status", "paid")
    .order("invoice_date", { ascending: true });
  return (data ?? []).map(({ status: _status, ...rest }) => rest);
}

export type LedgerEntry = {
  id: string;
  date: string;
  kind: "invoice" | "payment";
  label: string;
  /** Increases what the party owes us (sale invoice, payment out). */
  debitPaise: number;
  /** Decreases what the party owes us (payment in, purchase invoice). */
  creditPaise: number;
};

export async function getPartyLedger(partyId: string): Promise<{
  party: PartyRow;
  entries: (LedgerEntry & { runningPaise: number })[];
} | null> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: party } = await supabase
    .from("aimunim_parties")
    .select("*")
    .eq("id", partyId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!party) return null;

  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from("aimunim_invoices")
      .select("id, invoice_number, invoice_date, direction, total_paise, status")
      .eq("tenant_id", tenantId)
      .eq("party_id", partyId)
      .neq("status", "draft"),
    supabase
      .from("aimunim_payments")
      .select("id, payment_date, direction, amount_paise, mode")
      .eq("tenant_id", tenantId)
      .eq("party_id", partyId),
  ]);

  const entries: LedgerEntry[] = [];
  for (const inv of invoices ?? []) {
    entries.push({
      id: inv.id,
      date: inv.invoice_date,
      kind: "invoice",
      label: `${inv.direction === "sale" ? "Invoice" : "Purchase"} ${inv.invoice_number}`,
      debitPaise: inv.direction === "sale" ? inv.total_paise : 0,
      creditPaise: inv.direction === "purchase" ? inv.total_paise : 0,
    });
  }
  for (const p of payments ?? []) {
    entries.push({
      id: p.id,
      date: p.payment_date,
      kind: "payment",
      label: `Payment ${p.direction === "in" ? "received" : "paid"} (${p.mode})`,
      debitPaise: p.direction === "out" ? p.amount_paise : 0,
      creditPaise: p.direction === "in" ? p.amount_paise : 0,
    });
  }

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let running = party.opening_balance_paise;
  const withRunning = entries.map((e) => {
    running += e.debitPaise - e.creditPaise;
    return { ...e, runningPaise: running };
  });

  return { party, entries: withRunning };
}
