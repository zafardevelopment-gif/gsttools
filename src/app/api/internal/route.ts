import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendNotification, type NotificationType } from "@/server/notifications";

/**
 * Internal API for n8n workflows (and other trusted automations).
 * Auth: `Authorization: Bearer <INTERNAL_API_TOKEN>`.
 *
 * POST body: { action: "...", ...args }
 *   send_message   { tenant_id, recipient, body, type?, template?, params? }
 *   lookup_party   { tenant_id, phone }
 *   lookup_invoice { tenant_id, invoice_number }
 *   create_reminder{ tenant_id, party_id }  → queues payment_reminder sends for
 *                                             the party's unpaid invoices
 */

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const token = process.env.INTERNAL_API_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  if (!token || header !== `Bearer ${token}`) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const tenantId = String(body.tenant_id ?? "");
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (action) {
    case "send_message": {
      const recipient = String(body.recipient ?? "");
      const msg = String(body.body ?? "");
      if (!recipient || !msg) {
        return NextResponse.json(
          { error: "recipient and body are required" },
          { status: 400 },
        );
      }
      const { results } = await sendNotification({
        tenantId,
        type: (body.type as NotificationType) ?? "marketing",
        recipient,
        body: msg,
        template: body.template ? String(body.template) : undefined,
        params: body.params as Record<string, string> | undefined,
      });
      return NextResponse.json({ ok: true, results });
    }

    case "lookup_party": {
      const phone = String(body.phone ?? "");
      if (!phone) return NextResponse.json({ error: "phone is required" }, { status: 400 });
      const { data } = await admin
        .from("aimunim_parties")
        .select("id, name, type, phone, balance_paise, category")
        .eq("tenant_id", tenantId)
        .ilike("phone", `%${phone.slice(-10)}%`)
        .limit(5);
      return NextResponse.json({ ok: true, parties: data ?? [] });
    }

    case "lookup_invoice": {
      const number = String(body.invoice_number ?? "");
      if (!number) {
        return NextResponse.json({ error: "invoice_number is required" }, { status: 400 });
      }
      const { data } = await admin
        .from("aimunim_invoices")
        .select(
          "id, invoice_number, invoice_date, due_date, total_paise, amount_paid_paise, status, party_id",
        )
        .eq("tenant_id", tenantId)
        .eq("invoice_number", number)
        .maybeSingle();
      return NextResponse.json({ ok: true, invoice: data });
    }

    case "create_reminder": {
      const partyId = String(body.party_id ?? "");
      if (!partyId) {
        return NextResponse.json({ error: "party_id is required" }, { status: 400 });
      }
      const { data: party } = await admin
        .from("aimunim_parties")
        .select("name, phone")
        .eq("tenant_id", tenantId)
        .eq("id", partyId)
        .single();
      if (!party?.phone) {
        return NextResponse.json({ error: "Party has no phone number" }, { status: 400 });
      }
      const { data: unpaid } = await admin
        .from("aimunim_invoices")
        .select("id, invoice_number, total_paise, amount_paid_paise")
        .eq("tenant_id", tenantId)
        .eq("party_id", partyId)
        .eq("direction", "sale")
        .eq("voucher_type", "invoice")
        .in("status", ["unpaid", "partial"]);

      const duePaise = (unpaid ?? []).reduce(
        (s, i) => s + (i.total_paise - i.amount_paid_paise),
        0,
      );
      if (duePaise <= 0) return NextResponse.json({ ok: true, skipped: "Nothing due" });

      const { results } = await sendNotification({
        tenantId,
        type: "payment_reminder",
        recipient: party.phone,
        body: `Dear ${party.name}, a payment of ₹${(duePaise / 100).toFixed(2)} is pending against ${unpaid?.length ?? 0} invoice(s). Kindly arrange the payment.`,
        params: {
          name: party.name,
          amount: (duePaise / 100).toFixed(2),
          count: String(unpaid?.length ?? 0),
        },
        entityType: "party",
        entityId: partyId,
      });
      return NextResponse.json({ ok: true, due_paise: duePaise, results });
    }

    default:
      return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  }
}
