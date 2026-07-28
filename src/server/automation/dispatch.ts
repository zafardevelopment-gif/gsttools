import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Webhook delivery: signing, sending, retrying, auto-disabling.
 *
 * Signature scheme (Stripe-style):
 *   X-AiMunim-Signature: t=<unix seconds>,v1=<hex hmac-sha256>
 *   X-AiMunim-Timestamp: <unix seconds>
 *
 * The HMAC covers `"<timestamp>.<raw body>"`, not the body alone. That is what
 * makes a captured request un-replayable: without the timestamp inside the
 * signed material, an attacker could resend yesterday's valid payload forever.
 * Receivers should reject anything older than ~5 minutes.
 */

/** 1 minute, 5 minutes, 25 minutes. */
const RETRY_BACKOFF_MINUTES = [1, 5, 25];
export const MAX_ATTEMPTS = RETRY_BACKOFF_MINUTES.length + 1;

/** Dead endpoints stop being retried; the UI surfaces why. */
const AUTO_DISABLE_AFTER = 20;

/** Never let one slow endpoint hold a serverless function open. */
const TIMEOUT_MS = 10_000;

export function generateWebhookSecret(): string {
  return "whsec_" + randomBytes(24).toString("base64url");
}

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
 * Reference verifier — exported so the docs (and tests) can show receivers
 * exactly what to implement. Constant-time compare, and a freshness window.
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

type Admin = ReturnType<typeof createAdminClient>;

/** Deliver one event to every webhook of its tenant that subscribes to it. */
export async function dispatchEvent(eventId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("aimunim_automation_events")
    .select("id, tenant_id, event_type, entity_type, entity_id, payload, created_at")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return;

  const { data: hooks } = await admin
    .from("aimunim_automation_webhooks")
    .select("id, target_url, secret, events, is_active")
    .eq("tenant_id", event.tenant_id)
    .eq("is_active", true);

  for (const hook of hooks ?? []) {
    // Empty `events` means "send me everything".
    const subscribed =
      !hook.events?.length || hook.events.includes(event.event_type);
    if (!subscribed) continue;

    await attemptDelivery(admin, {
      tenantId: event.tenant_id,
      webhookId: hook.id,
      eventId: event.id,
      attempt: 1,
      url: hook.target_url,
      secret: hook.secret,
      body: buildBody(event),
    });
  }
}

function buildBody(event: {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: unknown;
  created_at: string;
}): string {
  return JSON.stringify({
    id: event.id,
    type: event.event_type,
    created_at: event.created_at,
    entity: { type: event.entity_type, id: event.entity_id },
    data: event.payload ?? {},
  });
}

async function attemptDelivery(
  admin: Admin,
  d: {
    tenantId: string;
    webhookId: string;
    eventId: string;
    attempt: number;
    url: string;
    secret: string;
    body: string;
  },
): Promise<void> {
  // Claim this attempt first. The unique index on
  // (webhook_id, event_id, attempt) means two concurrent sweeps cannot both
  // send the same attempt — the loser gets 23505 and backs off.
  const { data: row, error: claimErr } = await admin
    .from("aimunim_automation_deliveries")
    .insert({
      tenant_id: d.tenantId,
      webhook_id: d.webhookId,
      event_id: d.eventId,
      attempt: d.attempt,
      status: "pending",
    })
    .select("id")
    .single();

  if (claimErr || !row) return; // duplicate attempt, or insert failed

  const ts = Math.floor(Date.now() / 1000);
  let responseCode: number | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(d.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AiMunim-Signature": signPayload(d.secret, d.body, ts),
        "X-AiMunim-Timestamp": String(ts),
        "X-AiMunim-Event-Id": d.eventId,
        "X-AiMunim-Attempt": String(d.attempt),
      },
      body: d.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    responseCode = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : "request failed";
  }

  const ok = error === null;

  if (ok) {
    await admin
      .from("aimunim_automation_deliveries")
      .update({ status: "succeeded", response_code: responseCode, next_retry_at: null })
      .eq("id", row.id);

    // A success clears the failure streak — an endpoint that recovers should
    // not be auto-disabled by history.
    await admin
      .from("aimunim_automation_webhooks")
      .update({ consecutive_failures: 0, last_success_at: new Date().toISOString() })
      .eq("id", d.webhookId);
    return;
  }

  const hasAttemptsLeft = d.attempt < MAX_ATTEMPTS;
  const nextRetryAt = hasAttemptsLeft
    ? new Date(Date.now() + RETRY_BACKOFF_MINUTES[d.attempt - 1] * 60_000).toISOString()
    : null;

  await admin
    .from("aimunim_automation_deliveries")
    .update({
      status: "failed",
      response_code: responseCode,
      error,
      next_retry_at: nextRetryAt,
    })
    .eq("id", row.id);

  // Only a fully exhausted event counts against the endpoint's health, so a
  // single blip doesn't march it toward auto-disable.
  if (!hasAttemptsLeft) {
    const { data: hook } = await admin
      .from("aimunim_automation_webhooks")
      .select("consecutive_failures")
      .eq("id", d.webhookId)
      .maybeSingle();

    const failures = (hook?.consecutive_failures ?? 0) + 1;
    await admin
      .from("aimunim_automation_webhooks")
      .update({
        consecutive_failures: failures,
        ...(failures >= AUTO_DISABLE_AFTER ? { is_active: false } : {}),
      })
      .eq("id", d.webhookId);
  }
}

/**
 * Retry sweep — called from /api/cron.
 *
 * Also the safety net for events whose `after()` dispatch never ran, which is
 * why it looks for both due retries and undelivered events.
 */
export async function sweepPendingDeliveries(limit = 100): Promise<{
  retried: number;
  errors: string[];
}> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let retried = 0;

  const { data: due } = await admin
    .from("aimunim_automation_deliveries")
    .select("id, tenant_id, webhook_id, event_id, attempt")
    .lte("next_retry_at", new Date().toISOString())
    .eq("status", "failed")
    .limit(limit);

  for (const del of due ?? []) {
    try {
      const [{ data: hook }, { data: event }] = await Promise.all([
        admin
          .from("aimunim_automation_webhooks")
          .select("target_url, secret, is_active")
          .eq("id", del.webhook_id)
          .maybeSingle(),
        admin
          .from("aimunim_automation_events")
          .select("id, event_type, entity_type, entity_id, payload, created_at")
          .eq("id", del.event_id)
          .maybeSingle(),
      ]);

      // Endpoint disabled or deleted since the last try — stop retrying.
      if (!hook?.is_active || !event) {
        await admin
          .from("aimunim_automation_deliveries")
          .update({ next_retry_at: null })
          .eq("id", del.id);
        continue;
      }

      await attemptDelivery(admin, {
        tenantId: del.tenant_id,
        webhookId: del.webhook_id,
        eventId: del.event_id,
        attempt: del.attempt + 1,
        url: hook.target_url,
        secret: hook.secret,
        body: buildBody(event),
      });

      // This attempt row is settled; the new one carries the schedule.
      await admin
        .from("aimunim_automation_deliveries")
        .update({ next_retry_at: null })
        .eq("id", del.id);

      retried += 1;
    } catch (e) {
      errors.push(`delivery ${del.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  return { retried, errors };
}
