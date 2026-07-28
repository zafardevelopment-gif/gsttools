import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { dispatchEvent } from "@/server/automation/dispatch";
import type { Json } from "@/lib/database.types";

/**
 * Outbound event emission.
 *
 * The contract for callers is deliberately tiny: `emitEvent(...)` is one
 * INSERT and never throws. Saving an invoice must not get slower — or fail —
 * because someone's n8n box is down, so nothing here waits on the network.
 *
 * Delivery is attempted with `after()`, which runs once the response has been
 * flushed. If that never happens (process recycled mid-flight, serverless
 * instance frozen), the event still sits in the outbox and the cron sweep picks
 * it up. Losing an event requires both paths to fail.
 */

/**
 * Event catalogue. These strings are a public contract — an n8n workflow
 * branches on them — so add freely, never rename.
 */
export const EVENT_TYPES = [
  "invoice.created",
  "invoice.paid",
  "invoice.overdue",
  "payment.received",
  "party.created",
  "stock.low",
  "order.received",
  "subscription.expiring",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// Display labels live in lib/constants.ts, not here: this module is
// `server-only`, and the Automation screen is a Client Component.

export type EmitEventParams = {
  tenantId: string;
  type: EventType;
  entityType?: string;
  entityId?: string | null;
  /** Everything a workflow needs to act without calling back for more data. */
  payload: Record<string, unknown>;
};

/**
 * Record an event and try to deliver it.
 *
 * Never throws and never returns a failure — a broken webhook must not be able
 * to break the business action that triggered it. Problems surface in the
 * Activity Log, not as an exception in the invoice save path.
 */
export function emitEvent(params: EmitEventParams): void {
  const admin = createAdminClient();

  void admin
    .from("aimunim_automation_events")
    .insert({
      tenant_id: params.tenantId,
      event_type: params.type,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      payload: params.payload as Json,
    })
    .select("id")
    .single()
    .then(({ data, error }) => {
      if (error || !data) {
        console.error("[events] insert failed:", error?.message);
        return;
      }
      scheduleDispatch(data.id);
    });
}

/**
 * Kick off delivery after the response is sent.
 *
 * `after()` only exists inside a request scope; called from a background job it
 * throws. That is fine and expected — the catch falls through to the cron
 * sweep, which is the durable path anyway.
 */
function scheduleDispatch(eventId: string): void {
  try {
    after(async () => {
      try {
        await dispatchEvent(eventId);
      } catch (e) {
        console.error("[events] dispatch failed, cron will retry:", e);
      }
    });
  } catch {
    // Not in a request context (cron, script). The sweep will handle it.
  }
}
