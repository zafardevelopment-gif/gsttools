import { NextRequest, NextResponse } from "next/server";

/**
 * WhatsApp Business Cloud API webhook.
 *
 * GET  — Meta's one-time verification handshake (hub.challenge echo).
 * POST — inbound messages/status updates. We forward the raw payload to n8n
 *        (N8N_WEBHOOK_URL) so AI conversation flows can live there instead of
 *        in this backend, per the spec's n8n integration point.
 */

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Fire-and-forget forward to n8n; WhatsApp requires a fast 200 response.
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (n8nUrl) {
    fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((e) => console.error("[whatsapp-webhook] n8n forward failed:", e));
  }

  return NextResponse.json({ ok: true });
}
