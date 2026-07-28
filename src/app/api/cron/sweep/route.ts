import { NextRequest, NextResponse } from "next/server";
import { sweepPendingDeliveries } from "@/server/automation/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook delivery retry sweep — safe to call every few minutes.
 *
 * Why this exists separately from /api/cron:
 * the delivery backoff is 1 / 5 / 25 minutes, but /api/cron also generates
 * recurring invoices and sends reminders, so it can only run once a day. Left
 * as one endpoint, a failed webhook would retry *tomorrow* and the backoff
 * schedule would be decorative.
 *
 * This route does one thing — retry due deliveries — so it is cheap enough to
 * poll. It touches no billing tables and is idempotent: the unique index on
 * (webhook_id, event_id, attempt) means two overlapping sweeps cannot send the
 * same attempt twice.
 *
 * Trigger it with either:
 *   - n8n Schedule node → POST here every 5 minutes (works on any Vercel plan)
 *   - vercel.json cron `"schedule": "*\/5 * * * *"` (needs a plan that allows
 *     sub-daily crons; Hobby only fires once a day)
 *
 *   curl -X POST https://<app>/api/cron/sweep -H "Authorization: Bearer $CRON_SECRET"
 *
 * GET is supported because Vercel Cron issues GET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { retried, errors } = await sweepPendingDeliveries();
  return NextResponse.json({ ok: true, retried, errors });
}

export const GET = POST;
