"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { invoiceInputSchema, type InvoiceInput } from "@/lib/validation/invoice";
import {
  computeInvoiceTotals,
  resolvePlaceOfSupply,
  isInterstateSupply,
  type GstLineInput,
} from "@/lib/gst";
import { rupeesToPaise, formatINR } from "@/lib/money";
import { canCreateInvoice } from "@/server/gating";
import { VOUCHER_TYPES } from "@/lib/constants";
import { sendNotification } from "@/server/notifications";
import { publicEnv } from "@/lib/env";
import { logAudit } from "@/server/audit";

export type CreateInvoiceResult = { id?: string; error?: string };

/**
 * Create an invoice. Totals are recomputed on the server with the pure GST
 * function — the client's numbers are never trusted. Inserts the invoice
 * header, line items, and stock movements; DB triggers then update the party
 * balance and invoice paid/status.
 */
export async function createInvoiceAction(
  input: InvoiceInput,
): Promise<CreateInvoiceResult> {
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid invoice." };
  }
  const v = parsed.data;

  const { tenantId, userId } = await requireActiveContext();

  // Ledger/stock behaviour depends on the voucher type (invoice, quotation,
  // return, note, …). See VOUCHER_TYPES in constants.ts.
  const voucherMeta = VOUCHER_TYPES[v.voucherType];

  // Plan gating: only real invoices count towards the monthly cap.
  if (v.voucherType === "invoice") {
    const gate = await canCreateInvoice(v.status === "draft");
    if (!gate.ok) return { error: gate.error };
  }

  const supabase = await createClient();

  // Business state (origin of supply) + display settings.
  const { data: tenant } = await supabase
    .from("aimunim_tenants")
    .select("state_code, invoice_settings")
    .eq("id", tenantId)
    .single();
  const businessState = tenant?.state_code ?? "";
  const tenantSettings = (tenant?.invoice_settings ?? {}) as { auto_share?: boolean };

  // Resolve place of supply + intra/inter-state from the party.
  let placeOfSupply: string | undefined;
  if (v.partyId) {
    const { data: party } = await supabase
      .from("aimunim_parties")
      .select("state_code, gstin")
      .eq("id", v.partyId)
      .single();
    if (party) placeOfSupply = resolvePlaceOfSupply(party);
  }
  const interstate = isInterstateSupply(businessState, placeOfSupply);

  // Recompute totals from scratch (server authority).
  const calcLines: GstLineInput[] = v.lines.map((l) => ({
    qty: Number(l.qty),
    ratePaise: rupeesToPaise(Number(l.rate)),
    taxRate: Number(l.taxRate),
    discountPercent: Number(l.discountPercent) || 0,
    isTaxInclusive: !!l.isTaxInclusive,
  }));

  const totals = computeInvoiceTotals({
    lines: calcLines,
    isInterstate: interstate,
    invoiceType: v.invoiceType,
    additionalChargesPaise: rupeesToPaise(Number(v.additionalCharges) || 0),
    roundOff: v.roundOff,
  });

  // Voucher number (use provided, else generate atomically per type).
  let invoiceNumber = v.invoiceNumber?.trim();
  if (!invoiceNumber) {
    const { data: gen, error: genErr } = await supabase.rpc(
      "gst_next_invoice_number",
      {
        p_tenant_id: tenantId,
        p_direction: v.direction,
        p_voucher_type: v.voucherType,
      },
    );
    if (genErr || !gen) return { error: genErr?.message ?? "Could not generate number." };
    invoiceNumber = gen;
  }

  // Non-financial vouchers (quotation/proforma/challan/PO) have nothing to pay,
  // so they never show as "unpaid" — mark them paid-neutral via 'unpaid' only
  // for financial ones.
  const status = v.status === "draft" ? "draft" : "unpaid";

  // Insert header.
  const { data: invoice, error: invErr } = await supabase
    .from("aimunim_invoices")
    .insert({
      tenant_id: tenantId,
      party_id: v.partyId ?? null,
      direction: v.direction,
      voucher_type: v.voucherType,
      against_invoice_id: v.againstInvoiceId ?? null,
      payment_terms_days: v.paymentTermsDays || null,
      invoice_type: v.invoiceType,
      invoice_number: invoiceNumber,
      invoice_date: v.invoiceDate,
      due_date: v.dueDate || null,
      place_of_supply_state: placeOfSupply ?? null,
      is_interstate: interstate,
      subtotal_paise: totals.subtotalPaise,
      discount_paise: totals.discountPaise,
      taxable_value_paise: totals.taxableValuePaise,
      cgst_paise: totals.cgstPaise,
      sgst_paise: totals.sgstPaise,
      igst_paise: totals.igstPaise,
      total_tax_paise: totals.totalTaxPaise,
      additional_charges_paise: totals.additionalChargesPaise,
      round_off_paise: totals.roundOffPaise,
      total_paise: totals.totalPaise,
      status,
      template: v.template,
      notes: v.notes || null,
      terms: v.terms || null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (invErr || !invoice) {
    const dup = invErr?.code === "23505";
    return {
      error: dup
        ? `Invoice number "${invoiceNumber}" already exists.`
        : invErr?.message ?? "Could not create invoice.",
    };
  }

  // Insert line items (zip input meta with computed values).
  const itemRows = v.lines.map((l, i) => ({
    tenant_id: tenantId,
    invoice_id: invoice.id,
    item_id: l.itemId ?? null,
    line_no: i + 1,
    name: l.name,
    hsn_sac: l.hsn_sac || null,
    unit: l.unit || "PCS",
    qty: Number(l.qty),
    rate_paise: rupeesToPaise(Number(l.rate)),
    discount_percent: Number(l.discountPercent) || 0,
    discount_paise: totals.lines[i].discountPaise,
    taxable_value_paise: totals.lines[i].taxableValuePaise,
    tax_rate: totals.lines[i].taxRate,
    cgst_paise: totals.lines[i].cgstPaise,
    sgst_paise: totals.lines[i].sgstPaise,
    igst_paise: totals.lines[i].igstPaise,
    amount_paise: totals.lines[i].amountPaise,
  }));

  const { error: itemsErr } = await supabase
    .from("aimunim_invoice_items")
    .insert(itemRows);
  if (itemsErr) {
    // Roll back the header so we don't leave an empty invoice.
    await supabase.from("aimunim_invoices").delete().eq("id", invoice.id);
    return { error: itemsErr.message };
  }

  // Stock movements for product lines (skip drafts and no-stock voucher types).
  // voucherMeta.stock: -1 = stock out, +1 = stock in, 0 = no effect.
  if (status !== "draft" && voucherMeta.stock !== 0 && !v.skipStock) {
    const itemIds = v.lines.map((l) => l.itemId).filter(Boolean) as string[];
    if (itemIds.length) {
      const { data: items } = await supabase
        .from("aimunim_items")
        .select("id, type")
        .in("id", itemIds);
      const productIds = new Set(
        (items ?? []).filter((i) => i.type === "product").map((i) => i.id),
      );
      const moveType =
        v.voucherType === "sales_return" || v.voucherType === "purchase_return"
          ? ("return" as const)
          : v.direction === "sale"
            ? ("sale" as const)
            : ("purchase" as const);
      // For purchases, stock:-1 means goods leave us (purchase return), and the
      // plain purchase invoice (stock:-1 relative to party) means goods come IN,
      // so flip the sign for purchase-side invoices.
      const sign =
        v.voucherType === "invoice" && v.direction === "purchase"
          ? 1
          : voucherMeta.stock;
      const moves = v.lines
        .filter((l) => l.itemId && productIds.has(l.itemId))
        .map((l) => ({
          tenant_id: tenantId,
          item_id: l.itemId as string,
          qty_delta: sign * Number(l.qty),
          type: moveType,
          reference_type: "invoice",
          reference_id: invoice.id,
        }));
      if (moves.length) await supabase.from("aimunim_stock_movements").insert(moves);
    }
  }

  // Invoice auto-share: send the PDF link to the party via NotificationService
  // (WhatsApp by default; silently switches to SMS with the tenant setting).
  // Fire-and-forget — a messaging failure must never block the sale.
  if (
    v.voucherType === "invoice" &&
    status !== "draft" &&
    v.partyId &&
    tenantSettings.auto_share !== false
  ) {
    const { data: party } = await supabase
      .from("aimunim_parties")
      .select("name, phone")
      .eq("id", v.partyId)
      .single();
    if (party?.phone) {
      const pdfUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}/invoices/${invoice.id}/pdf`;
      sendNotification({
        tenantId,
        type: "invoice_generated",
        recipient: party.phone,
        body: `Dear ${party.name}, your invoice ${invoiceNumber} of ${formatINR(totals.totalPaise)} has been generated. View/download: ${pdfUrl}`,
        params: {
          name: party.name,
          number: invoiceNumber,
          amount: (totals.totalPaise / 100).toFixed(2),
          link: pdfUrl,
        },
        entityType: "invoice",
        entityId: invoice.id,
      }).catch((e) => console.error("[invoice auto-share] failed:", e));
    }
  }

  logAudit({
    tenantId,
    userId,
    action: `${v.voucherType}.created`,
    entityType: "invoice",
    entityId: invoice.id,
    data: { number: invoiceNumber, total_paise: totals.totalPaise },
  });

  revalidatePath("/invoices");
  revalidatePath("/parties");
  revalidatePath("/items");
  return { id: invoice.id };
}

/**
 * Convert a quotation / proforma / delivery challan into a full tax invoice.
 * Challan ka stock pehle hi nikal chuka hota hai, isliye us case me stock skip
 * hota hai. Naya invoice against_invoice_id se source voucher se link rehta hai.
 */
export async function convertToInvoiceAction(
  sourceId: string,
): Promise<CreateInvoiceResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: src } = await supabase
    .from("aimunim_invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", sourceId)
    .maybeSingle();
  if (!src) return { error: "Voucher not found." };
  if (!["quotation", "proforma", "delivery_challan"].includes(src.voucher_type)) {
    return { error: "Sirf quotation/proforma/challan convert ho sakte hain." };
  }
  if (src.is_cancelled) return { error: "Cancelled voucher convert nahi hota." };

  const { data: existing } = await supabase
    .from("aimunim_invoices")
    .select("id, invoice_number")
    .eq("tenant_id", tenantId)
    .eq("against_invoice_id", sourceId)
    .eq("voucher_type", "invoice")
    .maybeSingle();
  if (existing) {
    return { error: `Pehle hi invoice ${existing.invoice_number} me convert ho chuka hai.` };
  }

  const { data: lines } = await supabase
    .from("aimunim_invoice_items")
    .select("*")
    .eq("invoice_id", sourceId)
    .order("line_no");
  if (!lines?.length) return { error: "Voucher me koi line item nahi." };

  const res = await createInvoiceAction({
    direction: "sale",
    voucherType: "invoice",
    invoiceType: src.invoice_type,
    partyId: src.party_id,
    invoiceDate: new Date().toISOString().slice(0, 10),
    additionalCharges: src.additional_charges_paise / 100,
    roundOff: true,
    notes: `Converted from ${src.invoice_number}`,
    terms: src.terms ?? "",
    template: src.template,
    status: "final",
    // Challan already moved the stock when it was dispatched.
    skipStock: src.voucher_type === "delivery_challan",
    lines: lines.map((l) => ({
      itemId: l.item_id,
      name: l.name,
      hsn_sac: l.hsn_sac ?? "",
      unit: l.unit,
      qty: l.qty,
      rate: l.rate_paise / 100,
      taxRate: l.tax_rate,
      discountPercent: l.discount_percent,
    })),
  });
  if (res.error || !res.id) return res;

  await supabase
    .from("aimunim_invoices")
    .update({ against_invoice_id: sourceId })
    .eq("tenant_id", tenantId)
    .eq("id", res.id);

  revalidatePath("/invoices");
  return res;
}

/**
 * Edit an existing voucher: reverse its old stock effect, replace the line
 * items and header amounts, re-post stock. Number/type/direction stay fixed;
 * party balance + paid status settle via the DB triggers.
 */
export async function updateInvoiceAction(
  id: string,
  input: InvoiceInput,
): Promise<CreateInvoiceResult> {
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid invoice." };
  }
  const v = parsed.data;

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("aimunim_invoices")
    .select("id, direction, voucher_type, invoice_number, status, is_cancelled")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "Invoice not found." };
  if (existing.is_cancelled) return { error: "Cancelled voucher edit nahi ho sakta." };

  const voucherMeta = VOUCHER_TYPES[existing.voucher_type];

  const { data: tenant } = await supabase
    .from("aimunim_tenants")
    .select("state_code")
    .eq("id", tenantId)
    .single();

  let placeOfSupply: string | undefined;
  if (v.partyId) {
    const { data: party } = await supabase
      .from("aimunim_parties")
      .select("state_code, gstin")
      .eq("id", v.partyId)
      .single();
    if (party) placeOfSupply = resolvePlaceOfSupply(party);
  }
  const interstate = isInterstateSupply(tenant?.state_code ?? "", placeOfSupply);

  const calcLines: GstLineInput[] = v.lines.map((l) => ({
    qty: Number(l.qty),
    ratePaise: rupeesToPaise(Number(l.rate)),
    taxRate: Number(l.taxRate),
    discountPercent: Number(l.discountPercent) || 0,
    isTaxInclusive: !!l.isTaxInclusive,
  }));
  const totals = computeInvoiceTotals({
    lines: calcLines,
    isInterstate: interstate,
    invoiceType: v.invoiceType,
    additionalChargesPaise: rupeesToPaise(Number(v.additionalCharges) || 0),
    roundOff: v.roundOff,
  });

  // 1. Reverse the old stock effect (append-only ledger).
  const { data: oldMoves } = await supabase
    .from("aimunim_stock_movements")
    .select("item_id, qty_delta")
    .eq("reference_type", "invoice")
    .eq("reference_id", id);
  if (oldMoves?.length) {
    await supabase.from("aimunim_stock_movements").insert(
      oldMoves.map((m) => ({
        tenant_id: tenantId,
        item_id: m.item_id,
        qty_delta: -m.qty_delta,
        type: "adjustment" as const,
        reference_type: "invoice-edit",
        reference_id: id,
        notes: `Reversal for edit of ${existing.invoice_number}`,
      })),
    );
    // Old rows ko neutral karo taaki future edits/deletes double-reverse na karein.
    await supabase
      .from("aimunim_stock_movements")
      .update({ reference_type: "invoice-edited" })
      .eq("reference_type", "invoice")
      .eq("reference_id", id);
  }

  // 2. Replace line items.
  await supabase.from("aimunim_invoice_items").delete().eq("invoice_id", id);
  const { error: itemsErr } = await supabase.from("aimunim_invoice_items").insert(
    v.lines.map((l, i) => ({
      tenant_id: tenantId,
      invoice_id: id,
      item_id: l.itemId ?? null,
      line_no: i + 1,
      name: l.name,
      hsn_sac: l.hsn_sac || null,
      unit: l.unit || "PCS",
      qty: Number(l.qty),
      rate_paise: rupeesToPaise(Number(l.rate)),
      discount_percent: Number(l.discountPercent) || 0,
      discount_paise: totals.lines[i].discountPaise,
      taxable_value_paise: totals.lines[i].taxableValuePaise,
      tax_rate: totals.lines[i].taxRate,
      cgst_paise: totals.lines[i].cgstPaise,
      sgst_paise: totals.lines[i].sgstPaise,
      igst_paise: totals.lines[i].igstPaise,
      amount_paise: totals.lines[i].amountPaise,
    })),
  );
  if (itemsErr) return { error: itemsErr.message };

  // 3. Update the header (number/type/direction unchanged).
  const { error: updErr } = await supabase
    .from("aimunim_invoices")
    .update({
      party_id: v.partyId ?? null,
      invoice_type: v.invoiceType,
      invoice_date: v.invoiceDate,
      due_date: v.dueDate || null,
      place_of_supply_state: placeOfSupply ?? null,
      is_interstate: interstate,
      subtotal_paise: totals.subtotalPaise,
      discount_paise: totals.discountPaise,
      taxable_value_paise: totals.taxableValuePaise,
      cgst_paise: totals.cgstPaise,
      sgst_paise: totals.sgstPaise,
      igst_paise: totals.igstPaise,
      total_tax_paise: totals.totalTaxPaise,
      additional_charges_paise: totals.additionalChargesPaise,
      round_off_paise: totals.roundOffPaise,
      total_paise: totals.totalPaise,
      template: v.template,
      notes: v.notes || null,
      terms: v.terms || null,
    })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (updErr) return { error: updErr.message };

  // 4. Re-post stock for the new lines (same rules as create).
  if (existing.status !== "draft" && voucherMeta.stock !== 0) {
    const itemIds = v.lines.map((l) => l.itemId).filter(Boolean) as string[];
    if (itemIds.length) {
      const { data: items } = await supabase
        .from("aimunim_items")
        .select("id, type")
        .in("id", itemIds);
      const productIds = new Set(
        (items ?? []).filter((i) => i.type === "product").map((i) => i.id),
      );
      const moveType =
        existing.voucher_type === "sales_return" ||
        existing.voucher_type === "purchase_return"
          ? ("return" as const)
          : existing.direction === "sale"
            ? ("sale" as const)
            : ("purchase" as const);
      const sign =
        existing.voucher_type === "invoice" && existing.direction === "purchase"
          ? 1
          : voucherMeta.stock;
      const moves = v.lines
        .filter((l) => l.itemId && productIds.has(l.itemId))
        .map((l) => ({
          tenant_id: tenantId,
          item_id: l.itemId as string,
          qty_delta: sign * Number(l.qty),
          type: moveType,
          reference_type: "invoice",
          reference_id: id,
        }));
      if (moves.length) await supabase.from("aimunim_stock_movements").insert(moves);
    }
  }

  logAudit({
    tenantId,
    userId,
    action: `${existing.voucher_type}.edited`,
    entityType: "invoice",
    entityId: id,
    data: { number: existing.invoice_number, total_paise: totals.totalPaise },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/parties");
  revalidatePath("/items");
  return { id };
}

export async function deleteInvoiceAction(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();
  // Reverse stock for this invoice before deleting (movements cascade away).
  const { data: inv } = await supabase
    .from("aimunim_invoices")
    .select("direction")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (inv) {
    const { data: moves } = await supabase
      .from("aimunim_stock_movements")
      .select("item_id, qty_delta")
      .eq("reference_type", "invoice")
      .eq("reference_id", id);
    for (const m of moves ?? []) {
      await supabase.from("aimunim_stock_movements").insert({
        tenant_id: tenantId,
        item_id: m.item_id,
        qty_delta: -m.qty_delta,
        type: "adjustment",
        notes: "Reversal of deleted invoice",
      });
    }
  }
  const { error } = await supabase
    .from("aimunim_invoices")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  logAudit({
    tenantId,
    userId,
    action: "invoice.deleted",
    entityType: "invoice",
    entityId: id,
  });
  revalidatePath("/invoices");
  revalidatePath("/parties");
  return { ok: true };
}
