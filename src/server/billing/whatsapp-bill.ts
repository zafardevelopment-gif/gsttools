import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { sendNotification } from "@/server/notifications";
import { formatINR, rupeesToPaise, paiseToRupees } from "@/lib/money";
import { publicEnv } from "@/lib/env";
import { createInvoice } from "@/server/services/invoices";

/**
 * WhatsApp bill engine (DukaanMitra B01) — the server side of "bolke bill
 * banao". n8n parses the owner's voice/text with AI into this structured
 * input and calls /api/internal action=create_bill; this module does the rest:
 * find-or-create customer, catalog match, GST totals, stock, udhar, auto-share.
 *
 * No auth session here (trusted internal API), so everything uses the
 * service-role client scoped by tenant_id.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type CreateBillInput = {
  tenantId: string;
  customer?: { name?: string; phone?: string };
  items: { name: string; qty: number; rate?: number /* rupees */ }[];
  paymentMode?: "cash" | "upi" | "credit" | "bank" | "card";
  voucherType?: "invoice" | "sales_return" | "credit_note";
  notes?: string;
  /** Send the PDF to the customer on WhatsApp (default true). */
  autoShare?: boolean;
  /**
   * Skip the "item not in catalog, add karu?" confirmation and add unmatched
   * items straight away. Set this only when the owner has already confirmed
   * (see resolve_pending in the internal API).
   */
  forceAddUnmatched?: boolean;
};

export type CreateBillResult = {
  ok?: true;
  error?: string;
  /** One or more items weren't in the Items catalog — ask before adding them. */
  needsConfirmation?: true;
  unmatchedItems?: { name: string; rate: number }[];
  bill?: {
    id: string;
    number: string;
    total: string;
    total_paise: number;
    tax_paise: number;
    payment: string;
    customer: string | null;
    customer_outstanding_paise: number | null;
    pdf_url: string;
    lines: { name: string; qty: number; rate_paise: number; matched_catalog: boolean }[];
  };
};

/**
 * Voucher numbering used to live here as a read-then-upsert on
 * aimunim_invoice_counters, which could race the UI and hand out a duplicate
 * or skipped number. It now goes through the shared service, which uses the
 * atomic gst_next_invoice_number RPC. The prefix rules (SRN / CRN / tenant
 * prefix) live in that RPC too, so they cannot drift apart any more.
 */

/** Find a party by phone (last-10 match) or name; create a customer if new. */
export async function findOrCreateParty(
  admin: Admin,
  tenantId: string,
  customer: { name?: string; phone?: string } | undefined,
): Promise<{ id: string; name: string; phone: string | null; pricing_tier: string; state_code: string | null; gstin: string | null } | null> {
  if (!customer?.name && !customer?.phone) return null;

  if (customer.phone) {
    const { data } = await admin
      .from("aimunim_parties")
      .select("id, name, phone, pricing_tier, state_code, gstin")
      .eq("tenant_id", tenantId)
      .ilike("phone", `%${customer.phone.replace(/\D/g, "").slice(-10)}%`)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  if (customer.name) {
    const { data } = await admin
      .from("aimunim_parties")
      .select("id, name, phone, pricing_tier, state_code, gstin")
      .eq("tenant_id", tenantId)
      .ilike("name", `%${customer.name}%`)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  // Auto-profile (B03): first bill creates the customer record.
  const { data: created } = await admin
    .from("aimunim_parties")
    .insert({
      tenant_id: tenantId,
      type: "customer" as const,
      name: customer.name || `Customer ${customer.phone}`,
      phone: customer.phone || null,
      notes: "Auto-created from WhatsApp bill",
    })
    .select("id, name, phone, pricing_tier, state_code, gstin")
    .single();
  return created ?? null;
}

export async function createWhatsappBill(
  input: CreateBillInput,
): Promise<CreateBillResult> {
  const admin = createAdminClient();
  const voucherType = input.voucherType ?? "invoice";
  const paymentMode = input.paymentMode ?? "cash";

  if (!input.items?.length) return { error: "No items in the bill." };

  const { data: tenant } = await admin
    .from("aimunim_tenants")
    .select("name, invoice_settings")
    .eq("id", input.tenantId)
    .single();
  if (!tenant) return { error: "Tenant not found." };
  const tenantSettings = (tenant.invoice_settings ?? {}) as { auto_share?: boolean };

  const party = await findOrCreateParty(admin, input.tenantId, input.customer);
  if (paymentMode === "credit" && !party) {
    return { error: "Udhar bill ke liye customer ka naam ya phone chahiye." };
  }

  // Catalog match (B02): name se item dhundo — price/tax/HSN auto-fill.
  const isWholesale = party?.pricing_tier === "wholesale";
  const resolved: {
    itemId: string | null;
    name: string;
    hsn: string | null;
    unit: string;
    qty: number;
    ratePaise: number;
    taxRate: number;
    isProduct: boolean;
    matched: boolean;
  }[] = [];
  const unmatchedItems: { name: string; rate: number }[] = [];

  for (const line of input.items) {
    if (!line.name || !(line.qty > 0)) return { error: `Invalid line: ${line.name}` };
    const { data: match } = await admin
      .from("aimunim_items")
      .select("id, name, hsn_sac, unit, sale_price_paise, wholesale_price_paise, tax_rate, type")
      .eq("tenant_id", input.tenantId)
      .eq("is_active", true)
      .ilike("name", `%${line.name}%`)
      .limit(1)
      .maybeSingle();

    if (match) {
      const catalogPaise =
        isWholesale && match.wholesale_price_paise > 0
          ? match.wholesale_price_paise
          : match.sale_price_paise;
      resolved.push({
        itemId: match.id,
        name: match.name,
        hsn: match.hsn_sac,
        unit: match.unit,
        qty: line.qty,
        // Owner-spoken rate wins over catalog (haggling happens!).
        ratePaise: line.rate != null ? rupeesToPaise(line.rate) : catalogPaise,
        taxRate: match.tax_rate,
        isProduct: match.type === "product",
        matched: true,
      });
      continue;
    }

    if (line.rate == null) {
      return {
        error: `"${line.name}" catalog me nahi mila aur rate nahi bataya. Rate ke saath dobara bolen.`,
      };
    }

    if (!input.forceAddUnmatched) {
      // Don't guess — ask the owner before adding a new item to the catalog.
      unmatchedItems.push({ name: line.name, rate: line.rate });
      continue;
    }

    const ratePaise = rupeesToPaise(line.rate);
    // Owner already confirmed (forceAddUnmatched) — add it to the catalog
    // now so it shows up in the Items list and matches next time.
    const { data: newItem } = await admin
      .from("aimunim_items")
      .insert({
        tenant_id: input.tenantId,
        type: "product",
        name: line.name,
        unit: "PCS",
        sale_price_paise: ratePaise,
        tax_rate: 0,
      })
      .select("id")
      .single();
    resolved.push({
      itemId: newItem?.id ?? null,
      name: line.name,
      hsn: null,
      unit: "PCS",
      qty: line.qty,
      ratePaise,
      taxRate: 0,
      // No prior stock baseline for a brand-new item, so skip the stock
      // movement on this first sale (would otherwise go negative).
      isProduct: false,
      matched: false,
    });
  }

  if (unmatchedItems.length && !input.forceAddUnmatched) {
    return { ok: true, needsConfirmation: true, unmatchedItems };
  }

  const today = new Date().toISOString().slice(0, 10);

  // Hand off to the shared invoice service — same numbering RPC, same GST
  // maths and same stock rules as a bill typed in the UI. Everything above
  // this line is WhatsApp-specific (speech → catalog resolution); everything
  // the ledger cares about happens in one place.
  //
  // Items this bill just created have no opening-stock baseline, so their
  // stock movement is suppressed (the `isProduct: false` marker set above).
  const created = await createInvoice({
    db: admin,
    tenantId: input.tenantId,
    userId: null,
    source: "whatsapp",
    // The owner gets a richer, branded message below — don't send the generic
    // one too, or the customer receives the same bill twice.
    autoShare: false,
    skipStockForItemIds: resolved
      .filter((l) => l.itemId && !l.isProduct)
      .map((l) => l.itemId as string),
    input: {
      direction: "sale",
      voucherType,
      invoiceType: "gst",
      partyId: party?.id ?? null,
      invoiceDate: today,
      additionalCharges: 0,
      roundOff: true,
      status: "final",
      template: "classic",
      notes: input.notes ?? "Created via WhatsApp",
      lines: resolved.map((l) => ({
        itemId: l.itemId,
        name: l.name,
        hsn_sac: l.hsn ?? "",
        unit: l.unit,
        qty: l.qty,
        rate: paiseToRupees(l.ratePaise),
        taxRate: l.taxRate,
        discountPercent: 0,
      })),
    },
  });
  if (created.error || !created.id || !created.invoiceNumber) {
    return { error: created.error ?? "Bill create nahi hua." };
  }
  const invoiceId = created.id;
  const number = created.invoiceNumber;
  const totalPaise = created.totalPaise ?? 0;

  // Payment (B06): cash/upi/bank/card = paid now; credit = udhar ledger (B04).
  if (voucherType === "invoice" && paymentMode !== "credit") {
    await admin.from("aimunim_payments").insert({
      tenant_id: input.tenantId,
      party_id: party?.id ?? null,
      invoice_id: invoiceId,
      direction: "in",
      amount_paise: totalPaise,
      mode: paymentMode,
      payment_date: today,
      reference: "WhatsApp bill",
    });
  }

  // Auto-share PDF to the customer (B01).
  const pdfUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}/invoices/${invoiceId}/pdf`;
  if ((input.autoShare ?? tenantSettings.auto_share !== false) && party?.phone) {
    sendNotification({
      tenantId: input.tenantId,
      type: "invoice_generated",
      recipient: party.phone,
      body: `Namaskar ${party.name}, ${tenant.name} se aapka bill ${number} — ${formatINR(totalPaise)}${paymentMode === "credit" ? " (udhaar)" : ""}. Dekhen: ${pdfUrl}`,
      params: {
        name: party.name,
        number,
        amount: (totalPaise / 100).toFixed(2),
        link: pdfUrl,
      },
      entityType: "invoice",
      entityId: invoiceId,
    }).catch(() => {});
  }

  // Fresh outstanding after triggers ran.
  let outstanding: number | null = null;
  if (party) {
    const { data: p } = await admin
      .from("aimunim_parties")
      .select("balance_paise")
      .eq("id", party.id)
      .single();
    outstanding = p?.balance_paise ?? null;
  }

  // Tax is re-read from the saved row so the WhatsApp reply always quotes what
  // is actually on the invoice, not a locally recomputed number.
  const { data: saved } = await admin
    .from("aimunim_invoices")
    .select("total_tax_paise")
    .eq("id", invoiceId)
    .single();

  return {
    ok: true,
    bill: {
      id: invoiceId,
      number,
      total: formatINR(totalPaise),
      total_paise: totalPaise,
      tax_paise: saved?.total_tax_paise ?? 0,
      payment: paymentMode,
      customer: party?.name ?? null,
      customer_outstanding_paise: outstanding,
      pdf_url: pdfUrl,
      lines: resolved.map((l) => ({
        name: l.name,
        qty: l.qty,
        rate_paise: l.ratePaise,
        matched_catalog: l.matched,
      })),
    },
  };
}
