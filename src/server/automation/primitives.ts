import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure primitives for the automation surface: key generation, hashing and
 * payload redaction.
 *
 * Deliberately free of `server-only`, `next/*` and Supabase imports so this
 * module can be unit-tested directly. The security-critical helpers are the
 * ones most worth testing, and they should not require a running database or a
 * React Server Component context to exercise.
 */

export const KEY_PREFIX = "amk_live_";

/** Shown in the UI so a key is recognisable without being usable. */
const DISPLAY_PREFIX_LEN = KEY_PREFIX.length + 6;

/**
 * SHA-256 hex.
 *
 * Correct choice here, despite the usual "never use a fast hash" rule: an API
 * key is 256 bits of CSPRNG output, not a user-chosen password, so there is no
 * dictionary to attack. bcrypt/argon2 would also force a full table scan on
 * every request (you cannot index what you must compare row by row), whereas
 * this allows a single indexed lookup. Stripe and GitHub do the same.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Mint a new key. The plaintext is returned once, shown to the user and then
 * forgotten; only the hash and the display prefix are ever persisted.
 */
export function generateApiKey(): {
  key: string;
  keyHash: string;
  keyPrefix: string;
} {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  return {
    key,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, DISPLAY_PREFIX_LEN),
  };
}

/**
 * Fingerprint of a request body, used to detect the same Idempotency-Key being
 * replayed with different content — which is a client bug worth a 409 rather
 * than silently returning someone else's result.
 */
export function hashRequestBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

// ---- Webhook signing (0014) -------------------------------------------------

export function generateWebhookSecret(): string {
  return "whsec_" + randomBytes(24).toString("base64url");
}

/**
 * Sign an outbound webhook payload.
 *
 * The HMAC covers `"<timestamp>.<raw body>"`, not the body alone. That is what
 * makes a captured request un-replayable: with the timestamp outside the signed
 * material, an attacker could resend yesterday's valid payload forever and it
 * would still verify.
 */
export function signPayload(
  secret: string,
  rawBody: string,
  timestampSeconds: number,
): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${mac}`;
}

/**
 * Reference verifier — what a receiver (n8n Function node) should implement.
 * Exported so the docs and tests use the same code the docs describe.
 */
export function verifySignature(params: {
  secret: string;
  rawBody: string;
  header: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}): boolean {
  const parts = Object.fromEntries(
    params.header.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;

  // Freshness window: an old-but-validly-signed request must still be rejected.
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds ?? 300;
  if (Math.abs(now - t) > tolerance) return false;

  const expected = createHmac("sha256", params.secret)
    .update(`${t}.${params.rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const SECRET_KEY_RE =
  /(^|_)(token|secret|password|passwd|api_?key|authorization|auth|bearer|signature|credential)($|_)/i;

/**
 * Strip anything credential-shaped before a request body is written to the
 * ingest log. Those payloads are visible in the Activity Log UI, so a caller
 * who accidentally posts a token must not have it persisted in readable form.
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : redactSecrets(v, depth + 1);
    }
    return out;
  }
  // Catch a raw key pasted into an otherwise innocent free-text field.
  if (typeof value === "string" && value.startsWith("amk_")) return "[redacted]";
  return value;
}
