import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  hashRequestBody,
  redactSecrets,
} from "@/server/automation/primitives";

/**
 * Pure unit tests for the automation primitives — no database needed, so these
 * run in the existing vitest setup as-is.
 *
 * The DB-backed guarantees (cross-tenant denial, idempotent replay, gapless
 * numbering under concurrency) need a live Postgres and live in
 * src/test/integration/*, which requires `supabase start`. See A3 in
 * LAUNCH_CHECKLIST.md.
 */

describe("generateApiKey", () => {
  it("issues a prefixed, high-entropy key", () => {
    const { key } = generateApiKey();
    expect(key.startsWith("amk_live_")).toBe(true);
    // 32 random bytes as base64url ≈ 43 chars, plus the prefix.
    expect(key.length).toBeGreaterThan(40);
  });

  it("never repeats", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey().key));
    expect(keys.size).toBe(200);
  });

  it("stores a hash, not the key, and a non-secret display prefix", () => {
    const { key, keyHash, keyPrefix } = generateApiKey();
    expect(keyHash).not.toContain(key);
    expect(keyHash).toBe(hashApiKey(key));
    expect(keyHash).toHaveLength(64); // sha256 hex

    // The prefix must be useless as a credential.
    expect(key.startsWith(keyPrefix)).toBe(true);
    expect(keyPrefix.length).toBeLessThan(key.length / 2);
  });

  it("hashes deterministically so lookup by hash works", () => {
    const { key } = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it("gives completely different hashes for near-identical keys", () => {
    expect(hashApiKey("amk_live_aaa")).not.toBe(hashApiKey("amk_live_aab"));
  });
});

describe("hashRequestBody", () => {
  it("is stable for the same payload", () => {
    const body = { invoiceDate: "2026-07-28", lines: [{ name: "Aata", qty: 2 }] };
    expect(hashRequestBody(body)).toBe(hashRequestBody({ ...body }));
  });

  it("changes when any value changes — this is what makes key-reuse detectable", () => {
    const a = hashRequestBody({ amount: 100 });
    const b = hashRequestBody({ amount: 101 });
    expect(a).not.toBe(b);
  });

  it("handles null/undefined without throwing", () => {
    expect(() => hashRequestBody(undefined)).not.toThrow();
    expect(hashRequestBody(null)).toBe(hashRequestBody(undefined));
  });
});

describe("redactSecrets", () => {
  it("strips credential-shaped keys", () => {
    const out = redactSecrets({
      name: "Ramesh",
      api_key: "amk_live_secret",
      authorization: "Bearer abc",
      password: "hunter2",
    }) as Record<string, unknown>;

    expect(out.name).toBe("Ramesh");
    expect(out.api_key).toBe("[redacted]");
    expect(out.authorization).toBe("[redacted]");
    expect(out.password).toBe("[redacted]");
  });

  it("catches a raw key pasted into an innocent field", () => {
    const out = redactSecrets({ notes: "amk_live_oops" }) as Record<string, unknown>;
    expect(out.notes).toBe("[redacted]");
  });

  it("recurses into nested objects and arrays", () => {
    const out = redactSecrets({
      lines: [{ name: "Tel", token: "abc123" }],
      meta: { nested: { secret: "s3cr3t" } },
    }) as { lines: Record<string, unknown>[]; meta: { nested: Record<string, unknown> } };

    expect(out.lines[0].name).toBe("Tel");
    expect(out.lines[0].token).toBe("[redacted]");
    expect(out.meta.nested.secret).toBe("[redacted]");
  });

  it("leaves ordinary business values alone", () => {
    const out = redactSecrets({
      amount: 2500,
      gstin: "27ABCDE1234F1Z5",
      phone: "9811111111",
    }) as Record<string, unknown>;

    expect(out.amount).toBe(2500);
    expect(out.gstin).toBe("27ABCDE1234F1Z5");
    expect(out.phone).toBe("9811111111");
  });

  it("does not recurse forever on a cyclic-ish deep structure", () => {
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(() => redactSecrets(deep)).not.toThrow();
  });
});
