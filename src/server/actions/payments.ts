"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { paymentInputSchema, type PaymentInput } from "@/lib/validation/payment";
import { rupeesToPaise } from "@/lib/money";

export type ActionResult = { ok?: true; error?: string };

/**
 * Record a payment in/out. DB triggers (gst_after_payment_change) recompute the
 * party balance and the linked invoice's paid amount + status automatically.
 */
export async function createPaymentAction(input: PaymentInput): Promise<ActionResult> {
  const parsed = paymentInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const { error } = await supabase.from("aimunim_payments").insert({
    tenant_id: tenantId,
    party_id: v.partyId,
    invoice_id: v.invoiceId ?? null,
    direction: v.direction,
    amount_paise: rupeesToPaise(v.amount),
    mode: v.mode,
    payment_date: v.paymentDate,
    reference: v.reference || null,
    notes: v.notes || null,
    created_by: userId,
  });

  if (error) return { error: error.message };
  revalidatePath("/payments");
  revalidatePath("/parties");
  revalidatePath("/invoices");
  return { ok: true };
}

export async function deletePaymentAction(id: string): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_payments")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/payments");
  revalidatePath("/parties");
  revalidatePath("/invoices");
  return { ok: true };
}
