"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { logAudit } from "@/server/audit";

export type ActionResult = { ok?: true; error?: string };

/**
 * MOCK e-invoice (IRN) generation — spec Module 9 allows stubbing the IRP.
 * The IRN is a 64-hex hash of (gstin|fy|number), same shape as the real one.
 * Swap this action's internals with a GSP API call later; UI/schema unchanged.
 */
export async function generateEInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const [{ data: invoice }, { data: tenant }] = await Promise.all([
    supabase
      .from("aimunim_invoices")
      .select("id, invoice_number, invoice_date, direction, voucher_type, invoice_type, irn, total_paise, status")
      .eq("tenant_id", tenantId)
      .eq("id", invoiceId)
      .maybeSingle(),
    supabase.from("aimunim_tenants").select("gstin").eq("id", tenantId).single(),
  ]);

  if (!invoice) return { error: "Invoice not found." };
  if (invoice.irn) return { error: "e-Invoice already generated for this invoice." };
  if (invoice.voucher_type !== "invoice" || invoice.direction !== "sale") {
    return { error: "e-Invoice only applies to sale invoices." };
  }
  if (invoice.invoice_type !== "gst") return { error: "e-Invoice needs a GST invoice." };
  if (invoice.status === "draft") return { error: "Finalise the invoice first." };
  if (!tenant?.gstin) return { error: "Business GSTIN required — add it in Settings." };

  const irn = createHash("sha256")
    .update(`${tenant.gstin}|${invoice.invoice_date}|${invoice.invoice_number}`)
    .digest("hex");
  const qrPayload = JSON.stringify({
    SellerGstin: tenant.gstin,
    DocNo: invoice.invoice_number,
    DocDt: invoice.invoice_date,
    TotInvVal: (invoice.total_paise / 100).toFixed(2),
    Irn: irn,
    IrnDt: new Date().toISOString().slice(0, 10),
    Mock: true,
  });

  const { error } = await supabase
    .from("aimunim_invoices")
    .update({
      irn,
      irn_generated_at: new Date().toISOString(),
      irn_qr_payload: qrPayload,
    })
    .eq("tenant_id", tenantId)
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  logAudit({
    tenantId,
    userId,
    action: "einvoice.generated",
    entityType: "invoice",
    entityId: invoiceId,
    data: { irn },
  });
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

/** MOCK e-Way bill number (12 digits) — requires the IRN first, per the flow. */
export async function generateEwayBillAction(invoiceId: string): Promise<ActionResult> {
  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("aimunim_invoices")
    .select("id, irn, eway_bill_no")
    .eq("tenant_id", tenantId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { error: "Invoice not found." };
  if (!invoice.irn) return { error: "Pehle e-Invoice (IRN) generate karen." };
  if (invoice.eway_bill_no) return { error: "e-Way bill already generated." };

  // 12-digit numeric, non-zero leading.
  const n = randomBytes(6).readUIntBE(0, 6) % 900000000000;
  const ewayNo = String(100000000000 + n);

  const { error } = await supabase
    .from("aimunim_invoices")
    .update({ eway_bill_no: ewayNo, eway_generated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  logAudit({
    tenantId,
    userId,
    action: "ewaybill.generated",
    entityType: "invoice",
    entityId: invoiceId,
    data: { eway_bill_no: ewayNo },
  });
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}
