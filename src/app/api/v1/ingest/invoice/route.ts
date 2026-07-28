import { createIngestHandler } from "@/server/automation/handler";
import { createInvoice } from "@/server/services/invoices";
import type { InvoiceInput } from "@/lib/validation/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fill in the fields the invoice *form* always posts but an HTTP caller has no
 * reason to send.
 *
 * The shared schema builds these with a `numberish(0)` helper, which looks like
 * it carries a default but does not — the argument is only a fallback for
 * unparseable values, so zod still treats the field as required. Harmless for
 * the UI (the form posts every field); a pointless trap over HTTP, where a
 * caller with no discount should simply omit `discountPercent`.
 *
 * Normalising here rather than in `lib/validation/invoice.ts` keeps the UI's
 * validation behaviour untouched.
 *
 * Ordering matters: defaults come AFTER the spread. Putting them first lets the
 * spread overwrite them (TS2783) — that mistake already broke one build.
 */
function withApiDefaults(input: InvoiceInput): InvoiceInput {
  return {
    ...input,
    additionalCharges: input?.additionalCharges ?? 0,
    lines: input?.lines?.map((l) => ({
      ...l,
      taxRate: l.taxRate ?? 0,
      discountPercent: l.discountPercent ?? 0,
    })),
  };
}

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
 * Minimal body — everything else is defaulted by withApiDefaults():
 *   {
 *     "invoiceDate": "2026-07-28",
 *     "partyId": "…uuid…",
 *     "lines": [{ "name": "Aata 10kg", "qty": 2, "rate": 450, "taxRate": 5 }]
 *   }
 *
 * Required per line: `name`, `qty`, `rate`. `taxRate` and `discountPercent`
 * default to 0. `partyId` may be omitted for a cash/counter sale.
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
      input: withApiDefaults(input),
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
