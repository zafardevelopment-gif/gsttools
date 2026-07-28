import { createIngestHandler } from "@/server/automation/handler";
import { createParty } from "@/server/services/parties";
import type { PartyFormInput } from "@/lib/validation/party";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/party
 *
 * Creates a customer or supplier. Same service as the Parties screen, so GSTIN
 * validation, place-of-supply derivation and opening-balance handling match.
 *
 * Body example:
 *   { "type": "customer", "name": "Ramesh Traders", "phone": "9811111111",
 *     "gstin": "27ABCDE1234F1Z5" }
 */
export const POST = createIngestHandler({
  endpoint: "party",
  scope: "write",
  handle: async (body, ctx) => {
    const res = await createParty({
      db: ctx.db,
      tenantId: ctx.tenantId,
      userId: null,
      input: body as PartyFormInput,
      source: "api",
    });

    if (res.error || !res.id) {
      return { ok: false, message: res.error ?? "Party create nahi hui." };
    }

    return {
      ok: true,
      status: 201,
      entityType: "party",
      entityId: res.id,
      body: { id: res.id },
    };
  },
});
