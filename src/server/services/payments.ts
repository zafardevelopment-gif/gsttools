import "server-only";
import { paymentInputSchema, type PaymentInput } from "@/lib/validation/payment";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/server/audit";
import type { DbClient } from "@/server/services/invoices";

/**
 * Payment recording service — shared by the UI action and the ingest API.
 *
 * Note how little there is here: the party balance and the linked invoice's
 * paid amount + status are recomputed by the DB trigger
 * `gst_after_payment_change` (migration 0004). That is deliberate — settlement
 * maths lives next to the data, so no caller can get it wrong.
 */

export type CreatePaymentResult = { id?: string; error?: string };

export async function createPayment(params: {
  db: DbClient;
  tenantId: string;
  userId?: string | null;
  input: PaymentInput;
  source?: string;
}): Promise<CreatePaymentResult> {
  const parsed = paymentInputSchema.safeParse(params.input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  }
  const v = parsed.data;

  const { data, error } = await params.db
    .from("aimunim_payments")
    .insert({
      tenant_id: params.tenantId,
      party_id: v.partyId,
      invoice_id: v.invoiceId ?? null,
      direction: v.direction,
      amount_paise: rupeesToPaise(v.amount),
      mode: v.mode,
      payment_date: v.paymentDate,
      reference: v.reference || null,
      notes: v.notes || null,
      created_by: params.userId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not record payment." };

  logAudit({
    tenantId: params.tenantId,
    userId: params.userId ?? null,
    action: "payment.created",
    entityType: "payment",
    entityId: data.id,
    data: {
      amount_paise: rupeesToPaise(v.amount),
      direction: v.direction,
      source: params.source ?? "ui",
    },
  });

  return { id: data.id };
}
