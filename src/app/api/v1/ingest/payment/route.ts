import { createIngestHandler } from "@/server/automation/handler";
import { createPayment } from "@/server/services/payments";
import type { PaymentInput } from "@/lib/validation/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/payment
 *
 * Records a payment in or out. The party balance and the linked invoice's
 * paid amount + status are settled by the DB trigger, exactly as for a payment
 * entered in the UI.
 *
 * Body example:
 *   { "direction": "in", "partyId": "…uuid…", "invoiceId": "…uuid…",
 *     "amount": 2500, "mode": "upi", "paymentDate": "2026-07-28" }
 *
 * `amount` is in rupees; it is converted to integer paise server-side.
 */
export const POST = createIngestHandler({
  endpoint: "payment",
  scope: "write",
  handle: async (body, ctx) => {
    const res = await createPayment({
      db: ctx.db,
      tenantId: ctx.tenantId,
      userId: null,
      input: body as PaymentInput,
      source: "api",
    });

    if (res.error || !res.id) {
      return { ok: false, message: res.error ?? "Payment record nahi hui." };
    }

    return {
      ok: true,
      status: 201,
      entityType: "payment",
      entityId: res.id,
      body: { id: res.id },
    };
  },
});
