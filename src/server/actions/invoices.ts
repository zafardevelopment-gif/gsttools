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
import { rupeesToPaise } from "@/lib/money";
import { canCreateInvoice } from "@/server/gating";

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

  // Plan gating: block when trial/subscription expired or over the monthly cap.
  const gate = await canCreateInvoice(v.status === "draft");
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();

  // Business state (origin of supply).
  const { data: tenant } = await supabase
    .from("GST_tenants")
    .select("state_code")
    .eq("id", tenantId)
    .single();
  const businessState = tenant?.state_code ?? "";

  // Resolve place of supply + intra/inter-state from the party.
  let placeOfSupply: string | undefined;
  if (v.partyId) {
    const { data: party } = await supabase
      .from("GST_parties")
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

  // Invoice number (use provided, else generate atomically).
  let invoiceNumber = v.invoiceNumber?.trim();
  if (!invoiceNumber) {
    const { data: gen, error: genErr } = await supabase.rpc(
      "gst_next_invoice_number",
      { p_tenant_id: tenantId, p_direction: v.direction },
    );
    if (genErr || !gen) return { error: genErr?.message ?? "Could not generate number." };
    invoiceNumber = gen;
  }

  const status = v.status === "draft" ? "draft" : "unpaid";

  // Insert header.
  const { data: invoice, error: invErr } = await supabase
    .from("GST_invoices")
    .insert({
      tenant_id: tenantId,
      party_id: v.partyId ?? null,
      direction: v.direction,
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
    .from("GST_invoice_items")
    .insert(itemRows);
  if (itemsErr) {
    // Roll back the header so we don't leave an empty invoice.
    await supabase.from("GST_invoices").delete().eq("id", invoice.id);
    return { error: itemsErr.message };
  }

  // Stock movements for product lines (skip drafts).
  if (status !== "draft") {
    const itemIds = v.lines.map((l) => l.itemId).filter(Boolean) as string[];
    if (itemIds.length) {
      const { data: items } = await supabase
        .from("GST_items")
        .select("id, type")
        .in("id", itemIds);
      const productIds = new Set(
        (items ?? []).filter((i) => i.type === "product").map((i) => i.id),
      );
      const moves = v.lines
        .filter((l) => l.itemId && productIds.has(l.itemId))
        .map((l) => ({
          tenant_id: tenantId,
          item_id: l.itemId as string,
          qty_delta: v.direction === "sale" ? -Number(l.qty) : Number(l.qty),
          type: v.direction === "sale" ? ("sale" as const) : ("purchase" as const),
          reference_type: "invoice",
          reference_id: invoice.id,
        }));
      if (moves.length) await supabase.from("GST_stock_movements").insert(moves);
    }
  }

  revalidatePath("/invoices");
  revalidatePath("/parties");
  revalidatePath("/items");
  return { id: invoice.id };
}

export async function deleteInvoiceAction(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  // Reverse stock for this invoice before deleting (movements cascade away).
  const { data: inv } = await supabase
    .from("GST_invoices")
    .select("direction")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (inv) {
    const { data: moves } = await supabase
      .from("GST_stock_movements")
      .select("item_id, qty_delta")
      .eq("reference_type", "invoice")
      .eq("reference_id", id);
    for (const m of moves ?? []) {
      await supabase.from("GST_stock_movements").insert({
        tenant_id: tenantId,
        item_id: m.item_id,
        qty_delta: -m.qty_delta,
        type: "adjustment",
        notes: "Reversal of deleted invoice",
      });
    }
  }
  const { error } = await supabase
    .from("GST_invoices")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/invoices");
  revalidatePath("/parties");
  return { ok: true };
}
