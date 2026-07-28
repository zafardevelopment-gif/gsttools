import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError, redactSecrets } from "@/server/automation/errors";
import {
  authenticateRequest,
  checkRateLimit,
  hasScope,
  type AuthedKey,
} from "@/server/automation/auth";
import {
  claimIdempotencyKey,
  completeClaim,
  failClaim,
} from "@/server/automation/idempotency";

/**
 * The one pipeline every /api/v1/ingest/* route goes through.
 *
 * Order matters and is not arbitrary:
 *   1. authenticate  — no key, no tenant, no work
 *   2. scope check   — a read-only key must not write
 *   3. rate limit    — before we touch business tables
 *   4. parse body    — cheap, and needed to hash for idempotency
 *   5. claim key     — the duplicate-suppression lock
 *   6. run handler   — the only step allowed to create rows
 *   7. record result — so a retry replays instead of re-creating
 *
 * Keeping this in one place is deliberate: tenant isolation on this path is
 * enforced in application code (an API-key request has no auth.uid(), so RLS
 * cannot help), and the fewer places that decide "which tenant is this", the
 * fewer places can get it wrong. Routes never see the raw request.
 */

export type IngestContext = {
  tenantId: string;
  apiKeyId: string;
  /** Service-role client. Always scope queries by `tenantId` explicitly. */
  db: ReturnType<typeof createAdminClient>;
};

export type IngestOutcome =
  | { ok: true; status?: number; body: Record<string, unknown>; entityType?: string; entityId?: string }
  | { ok: false; status?: number; code?: "validation_failed" | "not_found"; message: string };

export function createIngestHandler(opts: {
  endpoint: string;
  scope?: "read" | "write";
  handle: (body: unknown, ctx: IngestContext) => Promise<IngestOutcome>;
}) {
  const requiredScope = opts.scope ?? "write";

  return async function POST(req: NextRequest): Promise<NextResponse> {
    // ---- 1. Authenticate -----------------------------------------------------
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      if (auth.reason === "missing") {
        return apiError(
          "unauthorized",
          "Authorization header missing. Bhejein: Authorization: Bearer amk_live_…",
        );
      }
      if (auth.reason === "disabled") {
        return apiError(
          "feature_disabled",
          "Is business ke liye Automation abhi on nahi hai. Settings → Automation se on karein.",
        );
      }
      return apiError("invalid_api_key", "API key galat hai ya revoke ho chuki hai.");
    }
    const key: AuthedKey = auth.key;

    // ---- 2. Scope ------------------------------------------------------------
    if (!hasScope(key, requiredScope)) {
      return apiError(
        "scope_denied",
        `Is key ke paas "${requiredScope}" permission nahi hai.`,
      );
    }

    // ---- 3. Rate limit -------------------------------------------------------
    const rate = await checkRateLimit(key.keyId);
    if (!rate.allowed) {
      return apiError("rate_limited", "Bahut zyada requests. Thodi der baad try karein.", {
        headers: { "Retry-After": String(rate.retryAfter) },
      });
    }

    // ---- 4. Body -------------------------------------------------------------
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("validation_failed", "Request body valid JSON nahi hai.");
    }

    const idempotencyKey = req.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return apiError(
        "idempotency_key_required",
        "Idempotency-Key header zaroori hai — isse retry pe duplicate entry nahi banti.",
      );
    }

    // ---- 5. Claim ------------------------------------------------------------
    let claim;
    try {
      claim = await claimIdempotencyKey({
        tenantId: key.tenantId,
        apiKeyId: key.keyId,
        idempotencyKey,
        endpoint: opts.endpoint,
        body: redactSecrets(body),
      });
    } catch (e) {
      console.error(`[ingest ${opts.endpoint}] claim failed:`, e);
      return apiError("internal_error", "Request record nahi ho payi. Dobara try karein.");
    }

    if (claim.state === "conflict") {
      return apiError(
        "idempotency_key_reused",
        "Yahi Idempotency-Key pehle alag data ke saath use ho chuki hai. Nayi key bhejein.",
      );
    }
    if (claim.state === "in_flight") {
      return apiError(
        "idempotency_key_reused",
        "Yahi request abhi process ho rahi hai. Thodi der baad retry karein.",
        { headers: { "Retry-After": "2" } },
      );
    }
    if (claim.state === "replay") {
      // The whole point: a retried call returns the original response and
      // creates nothing.
      return NextResponse.json(claim.response, {
        status: claim.status,
        headers: { "Idempotency-Replayed": "true" },
      });
    }

    // ---- 6. Do the work ------------------------------------------------------
    const ctx: IngestContext = {
      tenantId: key.tenantId,
      apiKeyId: key.keyId,
      db: createAdminClient(),
    };

    try {
      const result = await opts.handle(body, ctx);

      if (!result.ok) {
        const status = result.status ?? 422;
        const payload = {
          error: { code: result.code ?? "validation_failed", message: result.message },
        };
        await failClaim({
          logId: claim.logId,
          status,
          body: payload,
          message: result.message,
        });
        return NextResponse.json(payload, { status });
      }

      const status = result.status ?? 201;
      await completeClaim({
        logId: claim.logId,
        status,
        body: result.body,
        entityType: result.entityType,
        entityId: result.entityId ?? null,
      });
      return NextResponse.json(result.body, { status });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error";
      console.error(`[ingest ${opts.endpoint}] handler threw:`, e);
      const payload = { error: { code: "internal_error", message } };
      await failClaim({ logId: claim.logId, status: 500, body: payload, message });
      return NextResponse.json(payload, { status: 500 });
    }
  };
}
