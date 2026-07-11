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

/**
 * Record one payment allocated across multiple invoices (FIFO from the form).
 * Each allocation becomes its own payment row (same date/mode/reference), so
 * the existing per-invoice settlement triggers work unchanged; any unallocated
 * remainder lands as an on-account row (invoice_id NULL).
 */
export async function createAllocatedPaymentAction(input: {
  direction: "in" | "out";
  partyId: string;
  amount: number; // rupees
  mode: PaymentInput["mode"];
  paymentDate: string;
  reference?: string;
  notes?: string;
  allocations: { invoiceId: string; amount: number /* rupees */ }[];
}): Promise<ActionResult> {
  if (!input.partyId) return { error: "Select a party." };
  if (!(input.amount > 0)) return { error: "Amount must be greater than 0." };
  const allocated = input.allocations.reduce((s, a) => s + a.amount, 0);
  if (allocated - input.amount > 0.005) {
    return { error: "Allocation total amount se zyada nahi ho sakta." };
  }
  if (input.allocations.some((a) => !(a.amount > 0))) {
    return { error: "Har allocation 0 se zyada honi chahiye." };
  }

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const base = {
    tenant_id: tenantId,
    party_id: input.partyId,
    direction: input.direction,
    mode: input.mode,
    payment_date: input.paymentDate,
    reference: input.reference || null,
    notes: input.notes || null,
    created_by: userId,
  };

  const rows = input.allocations.map((a) => ({
    ...base,
    invoice_id: a.invoiceId,
    amount_paise: rupeesToPaise(a.amount),
  }));
  const remainder = input.amount - allocated;
  if (remainder > 0.005) {
    rows.push({ ...base, invoice_id: null as unknown as string, amount_paise: rupeesToPaise(remainder) });
  }

  const { error } = await supabase.from("aimunim_payments").insert(rows);
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
