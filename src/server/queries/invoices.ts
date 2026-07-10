import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import type {
  InvoiceRow,
  InvoiceItemRow,
  PartyRow,
  TenantRow,
} from "@/lib/database.types";

export type InvoiceListRow = InvoiceRow & { party_name: string | null };

export async function listInvoices(opts?: {
  direction?: "sale" | "purchase";
  voucherType?: InvoiceRow["voucher_type"];
}): Promise<InvoiceListRow[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  let q = supabase
    .from("aimunim_invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts?.direction) q = q.eq("direction", opts.direction);
  if (opts?.voucherType) q = q.eq("voucher_type", opts.voucherType);
  const { data: invoices } = await q;
  if (!invoices || invoices.length === 0) return [];

  // Resolve party names in one query.
  const partyIds = [...new Set(invoices.map((i) => i.party_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (partyIds.length) {
    const { data: parties } = await supabase
      .from("aimunim_parties")
      .select("id, name")
      .in("id", partyIds);
    (parties ?? []).forEach((p) => names.set(p.id, p.name));
  }

  return invoices.map((i) => ({
    ...i,
    party_name: i.party_id ? names.get(i.party_id) ?? null : null,
  }));
}

export type FullInvoice = {
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  party: PartyRow | null;
  tenant: TenantRow;
};

export async function getInvoice(id: string): Promise<FullInvoice | null> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("aimunim_invoices")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!invoice) return null;

  const [{ data: items }, { data: tenant }] = await Promise.all([
    supabase
      .from("aimunim_invoice_items")
      .select("*")
      .eq("invoice_id", id)
      .order("line_no", { ascending: true }),
    supabase.from("aimunim_tenants").select("*").eq("id", tenantId).single(),
  ]);

  let party: PartyRow | null = null;
  if (invoice.party_id) {
    const { data } = await supabase
      .from("aimunim_parties")
      .select("*")
      .eq("id", invoice.party_id)
      .maybeSingle();
    party = data;
  }

  return {
    invoice,
    items: items ?? [],
    party,
    tenant: tenant as TenantRow,
  };
}
