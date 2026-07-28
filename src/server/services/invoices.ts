import "server-only";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { invoiceInputSchema, type InvoiceInput } from "@/lib/validation/invoice";
import {
  computeInvoiceTotals,
  resolvePlaceOfSupply,
  isInterstateSupply,
  type GstLineInput,
} from "@/lib/gst";
import { rupeesToPaise, formatINR } from "@/lib/money";
import { VOUCHER_TYPES } from "@/lib/constants";
import { sendNotification } from "@/server/notifications";
import { publicEnv } from "@/lib/env";
import { logAudit } from "@/server/audit";
import type { GateResult } from "@/server/gating";

/**
 * Invoice creation service — the ONE place an invoice is created.
 *
 * Every entry point routes through here: the UI (server actions), the WhatsApp
 * voice-bill engine, recurring/cron generation, and (later) the automation
 * ingest API. Before this existed the logic was copy-pasted in three places,
 * two of which bumped the voucher counter with a non-atomic read-then-upsert —
 * so a WhatsApp bill and a UI bill saved in the same second could collide or
 * leave a gap in the number series. Under GST the series must be gapless and
 * unique per FY, so that was a correctness bug, not a style problem.
 *
 * This module is deliberately NOT a "use server" file and takes no cookies:
 * tenant, user and the Supabase client are all passed in, so it works from a
 * request, from cron, and from an API-key request identically.
 *
 * Anything request-scoped (revalidatePath, redirect) stays in the caller.
 */

/**
 * Either Supabase client works: the RLS-scoped one from a user request, or the
 * service-role one from trusted server contexts (cron, internal API).
 * Callers are responsible for passing a client appropriate to their trust level.
 */
export type DbClient =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

/** Where the invoice came from. Recorded in the audit trail. */
export type InvoiceSource = "ui" | "whatsapp" | "recurring" | "api";

export type CreateInvoiceParams = {
  db: DbClient;
  tenantId: string;
  /** auth.users id, or null for trusted server contexts with no user. */
  userId?: string | null;
  input: InvoiceInput;
  source?: InvoiceSource;
  /**
   * Plan-limit check, injected because the UI version reads the session cookie
   * and so can't run in cron/API contexts. Omit to skip the check — which is
   * what the non-UI paths did before this refactor.
   */
  checkPlanLimit?: (isDraft: boolean) => Promise<GateResult>;
  /**
   * Send the invoice PDF link to the party.
   *   undefined → follow the tenant's `invoice_settings.auto_share` (UI default)
   *   false     → never (for callers that send their own richer message)
   *   true      → force, ignoring the tenant setting
   */
  autoShare?: boolean;
  /**
   * Item ids that must NOT generate a stock movement, even though they are
   * products. Used by the WhatsApp bill engine for items it just created from
   * the owner's speech: they have no opening-stock baseline, so posting the
   * sale would drive stock straight to negative.
   */
  skipStockForItemIds?: string[];
};

export type CreateInvoiceResult = {
  id?: string;
  error?: string;
  /** Present on success — callers that message the customer need these. */
  invoiceNumber?: string;
  totalPaise?: number;
};

/**
 * Create an invoice (or any voucher type). Totals are recomputed here with the
 * pure GST function — the caller's numbers are never trusted. Inserts the
 * header, line items and stock movements; DB triggers then settle the party
 * balance and the invoice paid/status.
 */
export async function createInvoice({
  db,
  tenantId,
  userId = null,
  input,
  source = "ui",
  checkPlanLimit,
  autoShare,
  skipStockForItemIds,
}: CreateInvoiceParams): Promise<CreateInvoiceResult> {
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid invoice." };
  }
  const v = parsed.data;

  // Ledger/stock behaviour depends on the voucher type (invoice, quotation,
  // return, note, …). See VOUCHER_TYPES in constants.ts.
  const voucherMeta = VOUCHER_TYPES[v.voucherType];

  // Plan gating: only real invoices count towards the monthly cap.
  if (v.voucherType === "invoice" && checkPlanLimit) {
    const gate = await checkPlanLimit(v.status === "draft");
    if (!gate.ok) return { error: gate.error };
  }

  // Business state (origin of supply) + display settings.
  const { data: tenant } = await db
    .from("aimunim_tenants")
    .select("state_code, invoice_settings")
    .eq("id", tenantId)
    .single();
  const businessState = tenant?.state_code ?? "";
  const tenantSettings = (tenant?.invoice_settings ?? {}) as { auto_share?: boolean };

  // Resolve place of supply + intra/inter-state from the party.
  let placeOfSupply: string | undefined;
  if (v.partyId) {
    const { data: party } = await db
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
  //
  // The RPC does INSERT … ON CONFLICT DO UPDATE … RETURNING on
  // aimunim_invoice_counters, so concurrent callers serialise on the row lock
  // and each gets a distinct sequence value. Never replace this with a
  // read-then-write — that is precisely the race this service exists to kill.
  let invoiceNumber = v.invoiceNumber?.trim();
  if (!invoiceNumber) {
    const { data: gen, error: genErr } = await db.rpc("gst_next_invoice_number", {
      p_tenant_id: tenantId,
      p_direction: v.direction,
      p_voucher_type: v.voucherType,
    });
    if (genErr || !gen) {
      return { error: genErr?.message ?? "Could not generate number." };
    }
    invoiceNumber = gen;
  }

  // Non-financial vouchers (quotation/proforma/challan/PO) have nothing to pay,
  // so they never show as "unpaid" — mark them paid-neutral via 'unpaid' only
  // for financial ones.
  const status = v.status === "draft" ? "draft" : "unpaid";

  // Insert header.
  const { data: invoice, error: invErr } = await db
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

  const { error: itemsErr } = await db
    .from("aimunim_invoice_items")
    .insert(itemRows);
  if (itemsErr) {
    // Roll back the header so we don't leave an empty invoice.
    await db.from("aimunim_invoices").delete().eq("id", invoice.id);
    return { error: itemsErr.message };
  }

  // Stock movements for product lines (skip drafts and no-stock voucher types).
  // voucherMeta.stock: -1 = stock out, +1 = stock in, 0 = no effect.
  if (status !== "draft" && voucherMeta.stock !== 0 && !v.skipStock) {
    const itemIds = v.lines.map((l) => l.itemId).filter(Boolean) as string[];
    if (itemIds.length) {
      const { data: items } = await db
        .from("aimunim_items")
        .select("id, type")
        .in("id", itemIds);
      const noStock = new Set(skipStockForItemIds ?? []);
      const productIds = new Set(
        (items ?? [])
          .filter((i) => i.type === "product" && !noStock.has(i.id))
          .map((i) => i.id),
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
      if (moves.length) await db.from("aimunim_stock_movements").insert(moves);
    }
  }

  // Invoice auto-share: send the PDF link to the party via NotificationService
  // (WhatsApp by default; silently switches to SMS with the tenant setting).
  // Fire-and-forget — a messaging failure must never block the sale.
  const shouldShare = autoShare ?? (tenantSettings.auto_share !== false);
  if (
    shouldShare &&
    v.voucherType === "invoice" &&
    status !== "draft" &&
    v.partyId
  ) {
    const { data: party } = await db
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
    data: { number: invoiceNumber, total_paise: totals.totalPaise, source },
  });

  return {
    id: invoice.id,
    invoiceNumber,
    totalPaise: totals.totalPaise,
  };
}
