import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  KEY_PREFIX,
  hashApiKey,
  generateApiKey,
} from "@/server/automation/primitives";

// Re-exported so callers have one import site for the auth surface; the
// implementations live in primitives.ts because they are pure and testable.
export { hashApiKey, generateApiKey };

/**
 * API-key authentication for the automation surface.
 *
 * The security property that matters: a key resolves to EXACTLY ONE tenant,
 * and the caller never supplies a tenant id. This is the difference from the
 * old /api/internal, where one global token plus a body-supplied tenant_id
 * meant any holder could reach any tenant.
 *
 * Isolation is enforced in application code here, not by RLS. An API-key
 * request has no Supabase session, so auth.uid() is NULL and every
 * is_tenant_member() policy evaluates false — the RLS client would simply see
 * nothing. So these routes run on the service-role client, and `tenantId` from
 * this module is the single source of truth that every downstream service call
 * is scoped by. Treat any new query on this path as security-relevant.
 */

export type ApiScope = "read" | "write";

export type AuthedKey = {
  keyId: string;
  tenantId: string;
  scopes: ApiScope[];
};

/** Pull the bearer token out of the Authorization header. */
export function readBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export type AuthFailure =
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "disabled" };

export type AuthSuccess = { ok: true; key: AuthedKey };

/**
 * Resolve a bearer token to a live key + its tenant.
 *
 * Deliberately returns the same "invalid" reason for an unknown key, a revoked
 * key and a malformed key, so the response cannot be used to probe which keys
 * exist. "disabled" is distinguishable because it is the tenant's own setting
 * and the operator needs to be told to switch the feature on.
 */
export async function authenticateRequest(
  req: NextRequest,
): Promise<AuthSuccess | AuthFailure> {
  const token = readBearerToken(req);
  if (!token) return { ok: false, reason: "missing" };
  if (!token.startsWith(KEY_PREFIX)) return { ok: false, reason: "invalid" };

  const admin = createAdminClient();
  const { data: key } = await admin
    .from("aimunim_automation_api_keys")
    .select("id, tenant_id, key_hash, scopes, revoked_at")
    .eq("key_hash", hashApiKey(token))
    .is("revoked_at", null)
    .maybeSingle();

  if (!key) return { ok: false, reason: "invalid" };

  // The indexed lookup already proves equality; this is belt-and-braces
  // against a future refactor that widens the query.
  if (!constantTimeEqual(key.key_hash, hashApiKey(token))) {
    return { ok: false, reason: "invalid" };
  }

  const { data: tenant } = await admin
    .from("aimunim_tenants")
    .select("automation_enabled")
    .eq("id", key.tenant_id)
    .single();
  if (!tenant?.automation_enabled) return { ok: false, reason: "disabled" };

  // Best-effort usage stamp — never block the request on it.
  void admin
    .from("aimunim_automation_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id)
    .then(({ error }) => {
      if (error) console.error("[automation auth] last_used_at:", error.message);
    });

  return {
    ok: true,
    key: {
      keyId: key.id,
      tenantId: key.tenant_id,
      scopes: (key.scopes ?? []) as ApiScope[],
    },
  };
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hasScope(key: AuthedKey, scope: ApiScope): boolean {
  return key.scopes.includes(scope);
}

/**
 * Fixed-window rate limit, 60 requests/minute per key by default.
 * Counting happens in one atomic Postgres statement — see the RPC in 0013.
 * Returns the seconds to wait when over the limit.
 */
export async function checkRateLimit(
  keyId: string,
  limit = 60,
  windowSeconds = 60,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const admin = createAdminClient();
  const { data: hits, error } = await admin.rpc("gst_automation_rate_limit_hit", {
    p_api_key_id: keyId,
    p_window_seconds: windowSeconds,
  });

  // Fail open on a counter failure: a broken rate limiter must not take the
  // whole ingest surface down. The error is logged so it is not silent.
  if (error) {
    console.error("[automation rate limit] failed open:", error.message);
    return { allowed: true, retryAfter: 0 };
  }

  const used = hits ?? 0;
  if (used <= limit) return { allowed: true, retryAfter: 0 };

  const elapsed = Math.floor(Date.now() / 1000) % windowSeconds;
  return { allowed: false, retryAfter: Math.max(1, windowSeconds - elapsed) };
}
