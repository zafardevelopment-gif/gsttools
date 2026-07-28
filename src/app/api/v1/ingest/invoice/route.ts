import { createIngestHandler } from "@/server/automation/handler";
import { createInvoice } from "@/server/services/invoices";
import type { InvoiceInput } from "@/lib/validation/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/invoice
 *
 * Creates an invoice from an automation workflow. This calls the exact same
 * service the Invoices screen calls, so numbering, GST maths, stock movements
 * and ledger effects are identical to a hand-entered bill — there is no
 * "API invoice" that behaves differently.
 *
 * Headers:  Authorization: Bearer amk_live_…   (required)
 *           Idempotency-Key: <unique string>   (required)
 *
 * Body: the same shape as the invoice form. Minimal example:
 *   {
 *     "invoiceDate": "2026-07-28",
 *     "partyId": "…uuid…",
 *     "lines": [{ "name": "Aata 10kg", "qty": 2, "rate": 450, "taxRate": 5 }]
 *   }
 *
 * `tenantId` is NOT accepted in the body — it comes from the API key. That is
 * the whole security difference from the old /api/internal.
 */
export const POST = createIngestHandler({
  endpoint: "invoice",
  scope: "write",
  handle: async (body, ctx) => {
    const input = body as InvoiceInput;

    // Guard against a workflow that still sends the old /api/internal shape.
    // Silently ignoring a tenant_id would be worse than a clear error.
    if (input && typeof input === "object" && "tenant_id" in input) {
      return {
        ok: false,
        message:
          "tenant_id body me mat bhejein — wo API key se aata hai. Purana /api/internal format use ho raha hai.",
      };
    }

    const res = await createInvoice({
      db: ctx.db,
      tenantId: ctx.tenantId,
      userId: null,
      input: {
        // The shared form schema makes `additionalCharges` required because the
        // invoice form always posts it. Over HTTP that is a pointless trap — a
        // caller with no freight/packaging charge should just omit the field —
        // so default it here rather than changing the schema the UI depends on.
        additionalCharges: 0,
        ...input,
      },
      source: "api",
      // Plan limits are not applied on this path yet — see known bug #7 in
      // LAUNCH_CHECKLIST.md. Passing checkPlanLimit here is the one-line fix
      // once that business rule is decided.
    });

    if (res.error || !res.id) {
      // Surface the failing field. Zod's message alone is often "Invalid
      // input", which tells an n8n author nothing about what to fix.
      const detail = res.issues?.length
        ? res.issues.map((i) => `${i.path}: ${i.message}`).join("; ")
        : null;
      return {
        ok: false,
        message: detail ?? res.error ?? "Invoice create nahi hua.",
      };
    }

    return {
      ok: true,
      status: 201,
      entityType: "invoice",
      entityId: res.id,
      body: {
        id: res.id,
        invoice_number: res.invoiceNumber,
        total_paise: res.totalPaise,
      },
    };
  },
});
