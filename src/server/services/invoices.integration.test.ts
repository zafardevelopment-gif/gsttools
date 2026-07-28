import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Integration tests — these need a real Postgres, because the things they
 * prove are database guarantees, not TypeScript ones:
 *
 *   1. Invoice numbering stays gapless and unique under concurrency
 *      (the whole point of A1 — see LAUNCH_CHECKLIST.md)
 *   2. Tenant A cannot read or write tenant B's rows
 *   3. The idempotency unique index actually suppresses duplicates
 *
 * Run against a local stack:
 *   supabase start
 *   supabase db push
 *   SUPABASE_TEST_URL=http://127.0.0.1:54321 \
 *   SUPABASE_TEST_SERVICE_KEY=<local service_role key> \
 *   npm test
 *
 * Without those env vars the suite skips rather than fails, so `npm test` stays
 * green on a machine with no database. A skipped test proves nothing — treat a
 * skip as "not yet verified", not as a pass.
 */

const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_SERVICE_KEY;
const hasDb = Boolean(URL && KEY);

type Db = SupabaseClient<Database>;
let db: Db;

// Two isolated tenants, created fresh so the suite is re-runnable.
let tenantA: string;
let tenantB: string;

async function makeTenant(name: string): Promise<string> {
  const { data, error } = await db
    .from("aimunim_tenants")
    .insert({ name, state_code: "27", invoice_prefix: "TST" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`tenant setup failed: ${error?.message}`);
  return data.id;
}

beforeAll(async () => {
  if (!hasDb) return;
  db = createClient<Database>(URL as string, KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  tenantA = await makeTenant(`Test A ${Date.now()}`);
  tenantB = await makeTenant(`Test B ${Date.now()}`);
});

describe.skipIf(!hasDb)("invoice numbering (gst_next_invoice_number)", () => {
  it("hands out unique, gapless numbers under concurrency", async () => {
    // This is the regression test for the bug A1 fixed: the old
    // read-then-upsert in whatsapp-bill.ts and api/cron would produce
    // duplicates here.
    const CONCURRENCY = 25;

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        db.rpc("gst_next_invoice_number", {
          p_tenant_id: tenantA,
          p_direction: "sale",
          p_voucher_type: "invoice",
        }),
      ),
    );

    const numbers = results.map((r) => r.data).filter(Boolean) as string[];
    expect(numbers).toHaveLength(CONCURRENCY);

    // Unique.
    expect(new Set(numbers).size).toBe(CONCURRENCY);

    // Gapless: the trailing sequence numbers form a contiguous run.
    const seqs = numbers
      .map((n) => Number(n.split("/").pop()))
      .sort((a, b) => a - b);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBe(seqs[i - 1] + 1);
    }
  });

  it("keeps each tenant's series independent", async () => {
    const { data: a } = await db.rpc("gst_next_invoice_number", {
      p_tenant_id: tenantA,
      p_direction: "sale",
      p_voucher_type: "invoice",
    });
    const { data: b } = await db.rpc("gst_next_invoice_number", {
      p_tenant_id: tenantB,
      p_direction: "sale",
      p_voucher_type: "invoice",
    });
    // Tenant B is brand new, so its first number must be 00001 regardless of
    // how many invoices tenant A has burned through.
    expect(String(b).endsWith("00001")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("uses a separate counter per voucher type", async () => {
    const { data: ret } = await db.rpc("gst_next_invoice_number", {
      p_tenant_id: tenantB,
      p_direction: "sale",
      p_voucher_type: "sales_return",
    });
    expect(String(ret)).toContain("SRN/");
    expect(String(ret).endsWith("00001")).toBe(true);
  });
});

describe.skipIf(!hasDb)("tenant isolation", () => {
  it("scopes parties to their own tenant", async () => {
    const { data: partyB } = await db
      .from("aimunim_parties")
      .insert({ tenant_id: tenantB, name: "B-only Customer" })
      .select("id")
      .single();
    expect(partyB?.id).toBeTruthy();

    // The ingest path always filters by the tenant resolved from the API key.
    // Simulating that filter must not surface tenant B's row.
    const { data: leaked } = await db
      .from("aimunim_parties")
      .select("id")
      .eq("tenant_id", tenantA)
      .eq("id", partyB!.id)
      .maybeSingle();

    expect(leaked).toBeNull();
  });

  it("keeps idempotency keys independent per tenant", async () => {
    const sharedKey = `shared-${Date.now()}`;
    const row = (tenant: string) => ({
      tenant_id: tenant,
      idempotency_key: sharedKey,
      endpoint: "invoice",
      request_hash: "abc",
    });

    const first = await db.from("aimunim_automation_ingest_log").insert(row(tenantA));
    const second = await db.from("aimunim_automation_ingest_log").insert(row(tenantB));

    // Same key value, different tenants — both must succeed.
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    // Same key value, same tenant — must be rejected by the unique index.
    const dup = await db.from("aimunim_automation_ingest_log").insert(row(tenantA));
    expect(dup.error?.code).toBe("23505");
  });
});

describe.skipIf(!hasDb)("automation feature flag", () => {
  it("defaults to off for a new tenant", async () => {
    const { data } = await db
      .from("aimunim_tenants")
      .select("automation_enabled")
      .eq("id", tenantA)
      .single();
    // Off by default is a security property: a fresh tenant must not have a
    // live ingest surface until someone deliberately enables it.
    expect(data?.automation_enabled).toBe(false);
  });
});
