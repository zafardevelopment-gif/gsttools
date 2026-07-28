import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { hashRequestBody } from "@/server/automation/primitives";
import type { Json } from "@/lib/database.types";

// Re-exported so callers have one import site for the idempotency surface;
// the implementation is in primitives.ts because it is pure and unit-tested.
export { hashRequestBody };

/**
 * Idempotency for the ingest API.
 *
 * n8n retries on any network hiccup, and a retried "create invoice" that
 * actually creates a second invoice is unacceptable — it corrupts the GST
 * number series and the customer's ledger. So every write endpoint requires an
 * `Idempotency-Key` header.
 *
 * The lock is the unique index on (tenant_id, idempotency_key) from migration
 * 0013: we INSERT a 'pending' row first and let Postgres arbitrate. Whoever
 * wins the insert does the work; anyone else gets the stored response back.
 * No advisory locks, no application-level mutex, no race.
 */

export type ClaimResult =
  /** This caller owns the work; finish with `completeClaim` / `failClaim`. */
  | { state: "claimed"; logId: string }
  /** A previous identical call already finished — replay its response. */
  | { state: "replay"; response: unknown; status: number }
  /** Same key, different body. Almost always a client bug. */
  | { state: "conflict" }
  /** An identical call is still running. Client should retry shortly. */
  | { state: "in_flight" };

/**
 * The `response` column is jsonb. Callers hand us plain objects that are about
 * to be JSON-serialised anyway, but TypeScript cannot prove `unknown` is `Json`,
 * so the assertion lives here once instead of in every route.
 */
function asJson(value: unknown): Json {
  return value as Json;
}

/**
 * Try to claim an idempotency key for this request.
 *
 * Note the deliberate ordering: the log row is written BEFORE any business
 * work happens. If the process dies mid-invoice the row stays 'pending' and a
 * retry gets `in_flight` rather than silently creating a duplicate.
 */
export async function claimIdempotencyKey(params: {
  tenantId: string;
  apiKeyId: string;
  idempotencyKey: string;
  endpoint: string;
  body: unknown;
}): Promise<ClaimResult> {
  const admin = createAdminClient();
  const requestHash = hashRequestBody(params.body);

  const { data: inserted, error } = await admin
    .from("aimunim_automation_ingest_log")
    .insert({
      tenant_id: params.tenantId,
      api_key_id: params.apiKeyId,
      idempotency_key: params.idempotencyKey,
      endpoint: params.endpoint,
      request_hash: requestHash,
      status: "pending",
    })
    .select("id")
    .single();

  if (!error && inserted) return { state: "claimed", logId: inserted.id };

  // 23505 = unique violation on (tenant_id, idempotency_key): someone got here
  // first. Anything else is a real failure and should surface.
  if (error && error.code !== "23505") throw new Error(error.message);

  const { data: existing } = await admin
    .from("aimunim_automation_ingest_log")
    .select("status, request_hash, response")
    .eq("tenant_id", params.tenantId)
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();

  if (!existing) return { state: "in_flight" };

  // Same key with a different payload means the client is reusing keys. Return
  // 409 rather than the wrong record — silently replaying here would be worse.
  if (existing.request_hash !== requestHash) return { state: "conflict" };

  if (existing.status === "pending") return { state: "in_flight" };

  const stored = (existing.response ?? {}) as { body?: unknown; status?: number };
  return {
    state: "replay",
    response: stored.body ?? {},
    status: existing.status === "failed" ? (stored.status ?? 422) : (stored.status ?? 200),
  };
}

export async function completeClaim(params: {
  logId: string;
  status: number;
  body: unknown;
  entityType?: string;
  entityId?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("aimunim_automation_ingest_log")
    .update({
      status: "succeeded",
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      response: asJson({ status: params.status, body: params.body }),
    })
    .eq("id", params.logId);
  if (error) console.error("[idempotency] complete failed:", error.message);
}

export async function failClaim(params: {
  logId: string;
  status: number;
  body: unknown;
  message: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("aimunim_automation_ingest_log")
    .update({
      status: "failed",
      error: params.message,
      response: asJson({ status: params.status, body: params.body }),
    })
    .eq("id", params.logId);
  if (error) console.error("[idempotency] fail-mark failed:", error.message);
}
