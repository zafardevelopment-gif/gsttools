import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { sendNotification } from "@/server/notifications";
import {
  computeInvoiceTotals,
  isInterstateSupply,
  type GstLineInput,
} from "@/lib/gst";
import { formatINR, rupeesToPaise } from "@/lib/money";
import { publicEnv } from "@/lib/env";

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
};

export type CreateBillResult = {
  ok?: true;
  error?: string;
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

/** FY tag like 2627 for Apr-2026..Mar-2027. */
function fyTag(d = new Date()): string {
  const start = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

const NUMBER_PREFIX: Record<string, string | null> = {
  invoice: null, // tenant's own prefix
  sales_return: "SRN",
  credit_note: "CRN",
};

async function nextNumber(
  admin: Admin,
  tenantId: string,
  voucherType: string,
  tenantPrefix: string,
): Promise<string> {
  const { data: counter } = await admin
    .from("aimunim_invoice_counters")
    .select("last_seq")
    .eq("tenant_id", tenantId)
    .eq("direction", "sale")
    .eq("voucher_type", voucherType)
    .maybeSingle();
  const seq = (counter?.last_seq ?? 0) + 1;
  await admin.from("aimunim_invoice_counters").upsert(
    { tenant_id: tenantId, direction: "sale", voucher_type: voucherType, last_seq: seq },
    { onConflict: "tenant_id,direction,voucher_type" },
  );
  const prefix = NUMBER_PREFIX[voucherType] ?? tenantPrefix;
  return `${prefix}/${fyTag()}/${String(seq).padStart(5, "0")}`;
}

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
    .select("state_code, invoice_prefix, name")
    .eq("id", input.tenantId)
    .single();
  if (!tenant) return { error: "Tenant not found." };

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
    } else {
      if (line.rate == null) {
        return {
          error: `"${line.name}" catalog me nahi mila aur rate nahi bataya. Rate ke saath dobara bolen.`,
        };
      }
      resolved.push({
        itemId: null,
        name: line.name,
        hsn: null,
        unit: "PCS",
        qty: line.qty,
        ratePaise: rupeesToPaise(line.rate),
        taxRate: 0,
        isProduct: false,
        matched: false,
      });
    }
  }

  const placeOfSupply = party?.state_code || party?.gstin?.slice(0, 2) || undefined;
  const interstate = isInterstateSupply(tenant.state_code, placeOfSupply);

  const calcLines: GstLineInput[] = resolved.map((l) => ({
    qty: l.qty,
    ratePaise: l.ratePaise,
    taxRate: l.taxRate,
    discountPercent: 0,
  }));
  const totals = computeInvoiceTotals({
    lines: calcLines,
    isInterstate: interstate,
    invoiceType: "gst",
    additionalChargesPaise: 0,
    roundOff: true,
  });

  const number = await nextNumber(
    admin,
    input.tenantId,
    voucherType,
    tenant.invoice_prefix ?? "INV",
  );
  const today = new Date().toISOString().slice(0, 10);

  const { data: invoice, error: invErr } = await admin
    .from("aimunim_invoices")
    .insert({
      tenant_id: input.tenantId,
      party_id: party?.id ?? null,
      direction: "sale",
      voucher_type: voucherType,
      invoice_type: "gst",
      invoice_number: number,
      invoice_date: today,
      place_of_supply_state: placeOfSupply ?? null,
      is_interstate: interstate,
      subtotal_paise: totals.subtotalPaise,
      discount_paise: totals.discountPaise,
      taxable_value_paise: totals.taxableValuePaise,
      cgst_paise: totals.cgstPaise,
      sgst_paise: totals.sgstPaise,
      igst_paise: totals.igstPaise,
      total_tax_paise: totals.totalTaxPaise,
      additional_charges_paise: 0,
      round_off_paise: totals.roundOffPaise,
      total_paise: totals.totalPaise,
      status: "unpaid",
      template: "classic",
      notes: input.notes ?? "Created via WhatsApp",
    })
    .select("id")
    .single();
  if (invErr || !invoice) return { error: invErr?.message ?? "Bill create nahi hua." };

  await admin.from("aimunim_invoice_items").insert(
    resolved.map((l, i) => ({
      tenant_id: input.tenantId,
      invoice_id: invoice.id,
      item_id: l.itemId,
      line_no: i + 1,
      name: l.name,
      hsn_sac: l.hsn,
      unit: l.unit,
      qty: l.qty,
      rate_paise: l.ratePaise,
      discount_percent: 0,
      discount_paise: totals.lines[i].discountPaise,
      taxable_value_paise: totals.lines[i].taxableValuePaise,
      tax_rate: totals.lines[i].taxRate,
      cgst_paise: totals.lines[i].cgstPaise,
      sgst_paise: totals.lines[i].sgstPaise,
      igst_paise: totals.lines[i].igstPaise,
      amount_paise: totals.lines[i].amountPaise,
    })),
  );

  // Stock: invoice = out; sales_return = back in; credit_note = none.
  if (voucherType !== "credit_note") {
    const sign = voucherType === "sales_return" ? 1 : -1;
    const moves = resolved
      .filter((l) => l.itemId && l.isProduct)
      .map((l) => ({
        tenant_id: input.tenantId,
        item_id: l.itemId as string,
        qty_delta: sign * l.qty,
        type: voucherType === "sales_return" ? ("return" as const) : ("sale" as const),
        reference_type: "invoice",
        reference_id: invoice.id,
      }));
    if (moves.length) await admin.from("aimunim_stock_movements").insert(moves);
  }

  // Payment (B06): cash/upi/bank/card = paid now; credit = udhar ledger (B04).
  if (voucherType === "invoice" && paymentMode !== "credit") {
    await admin.from("aimunim_payments").insert({
      tenant_id: input.tenantId,
      party_id: party?.id ?? null,
      invoice_id: invoice.id,
      direction: "in",
      amount_paise: totals.totalPaise,
      mode: paymentMode,
      payment_date: today,
      reference: "WhatsApp bill",
    });
  }

  // Auto-share PDF to the customer (B01).
  const pdfUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}/invoices/${invoice.id}/pdf`;
  if ((input.autoShare ?? true) && party?.phone) {
    sendNotification({
      tenantId: input.tenantId,
      type: "invoice_generated",
      recipient: party.phone,
      body: `Namaskar ${party.name}, ${tenant.name} se aapka bill ${number} — ${formatINR(totals.totalPaise)}${paymentMode === "credit" ? " (udhaar)" : ""}. Dekhen: ${pdfUrl}`,
      params: {
        name: party.name,
        number,
        amount: (totals.totalPaise / 100).toFixed(2),
        link: pdfUrl,
      },
      entityType: "invoice",
      entityId: invoice.id,
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

  return {
    ok: true,
    bill: {
      id: invoice.id,
      number,
      total: formatINR(totals.totalPaise),
      total_paise: totals.totalPaise,
      tax_paise: totals.totalTaxPaise,
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
