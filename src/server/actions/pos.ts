"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { createInvoiceAction } from "@/server/actions/invoices";
import type { InvoiceInput } from "@/lib/validation/invoice";
import { rupeesToPaise } from "@/lib/money";
import type { PaymentMode } from "@/lib/constants";

export type PosCheckoutResult = { id?: string; error?: string };

/**
 * POS checkout = create the sale invoice + (optionally) record the money
 * received in one go. Unlike the standard payment action, POS allows a
 * party-less "Cash Sale", so the payment row is inserted directly here
 * (party_id stays NULL; the invoice-payment trigger still settles status).
 */
export async function posCheckoutAction(input: {
  invoice: InvoiceInput;
  receivedAmount: number; // rupees
  mode: PaymentMode;
}): Promise<PosCheckoutResult> {
  const res = await createInvoiceAction(input.invoice);
  if (res.error || !res.id) return res;

  if (input.receivedAmount > 0) {
    const { tenantId, userId } = await requireActiveContext();
    const supabase = await createClient();
    const { error } = await supabase.from("aimunim_payments").insert({
      tenant_id: tenantId,
      party_id: input.invoice.partyId ?? null,
      invoice_id: res.id,
      direction: "in",
      amount_paise: rupeesToPaise(input.receivedAmount),
      mode: input.mode,
      payment_date: input.invoice.invoiceDate,
      reference: "POS",
      created_by: userId,
    });
    // The sale is already saved; a failed payment insert shouldn't lose it.
    if (error) return { id: res.id, error: `Invoice saved, but payment failed: ${error.message}` };
  }

  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { id: res.id };
}
