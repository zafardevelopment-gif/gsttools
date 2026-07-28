import { createHash, randomBytes } from "node:crypto";

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
