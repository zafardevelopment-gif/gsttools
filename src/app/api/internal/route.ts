import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendNotification, type NotificationType } from "@/server/notifications";
import {
  createWhatsappBill,
  type CreateBillInput,
} from "@/server/billing/whatsapp-bill";
import { formatINR, rupeesToPaise } from "@/lib/money";

/**
 * Internal API for n8n workflows (and other trusted automations).
 * Auth: `Authorization: Bearer <INTERNAL_API_TOKEN>`.
 *
 * POST body: { action: "...", ...args }
 *
 * Messaging / lookups:
 *   send_message   { tenant_id, recipient, body, type?, template?, params? }
 *   lookup_party   { tenant_id, phone }
 *   lookup_invoice { tenant_id, invoice_number }
 *   create_reminder{ tenant_id, party_id }
 *
 * WhatsApp billing (DukaanMitra Module 2 — n8n parses voice/text, calls these):
 *   create_bill        { tenant_id, customer?{name,phone}, items[{name,qty,rate?}],
 *                        payment_mode?, voucher_type?, notes? }        (B01/B04/B06/B07)
 *   record_payment     { tenant_id, party{name|phone}, amount, mode? } (B04 partial)
 *   today_summary      { tenant_id, date? }                            (B06/W02)
 *   outstanding_list   { tenant_id }                                   (B04)
 *   party_summary      { tenant_id, party{name|phone} }                (B03)
 *   lookup_item        { tenant_id, item }                             (B02)
 *   update_item_price  { tenant_id, item, price?, wholesale_price? }   (B02)
 *   low_stock          { tenant_id }                                   (W05)
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

  /** Resolve a party from {name?, phone?} without creating one. */
  async function resolveParty(ref: { name?: string; phone?: string } | undefined) {
    if (!ref?.name && !ref?.phone) return null;
    if (ref.phone) {
      const { data } = await admin
        .from("aimunim_parties")
        .select("id, name, phone, balance_paise")
        .eq("tenant_id", tenantId)
        .ilike("phone", `%${String(ref.phone).replace(/\D/g, "").slice(-10)}%`)
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }
    if (ref.name) {
      const { data } = await admin
        .from("aimunim_parties")
        .select("id, name, phone, balance_paise")
        .eq("tenant_id", tenantId)
        .ilike("name", `%${ref.name}%`)
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }
    return null;
  }

  switch (action) {
    case "create_bill": {
      const result = await createWhatsappBill({
        tenantId,
        customer: body.customer as CreateBillInput["customer"],
        items: (body.items as CreateBillInput["items"]) ?? [],
        paymentMode: body.payment_mode as CreateBillInput["paymentMode"],
        voucherType: body.voucher_type as CreateBillInput["voucherType"],
        notes: body.notes ? String(body.notes) : undefined,
        autoShare: body.auto_share !== false,
      });
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result);
    }

    case "record_payment": {
      const party = await resolveParty(body.party as { name?: string; phone?: string });
      if (!party) return NextResponse.json({ error: "Party nahi mili." }, { status: 404 });
      const amount = Number(body.amount ?? 0);
      if (!(amount > 0)) return NextResponse.json({ error: "amount required (rupees)" }, { status: 400 });
      const mode = ["cash", "upi", "bank", "cheque", "card", "other"].includes(String(body.mode))
        ? (String(body.mode) as "cash" | "upi" | "bank" | "cheque" | "card" | "other")
        : "cash";

      const { error } = await admin.from("aimunim_payments").insert({
        tenant_id: tenantId,
        party_id: party.id,
        direction: "in",
        amount_paise: rupeesToPaise(amount),
        mode,
        payment_date: new Date().toISOString().slice(0, 10),
        reference: "WhatsApp",
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const { data: fresh } = await admin
        .from("aimunim_parties")
        .select("balance_paise")
        .eq("id", party.id)
        .single();
      return NextResponse.json({
        ok: true,
        party: party.name,
        received: formatINR(rupeesToPaise(amount)),
        new_outstanding_paise: fresh?.balance_paise ?? null,
        new_outstanding: formatINR(Math.max(0, fresh?.balance_paise ?? 0)),
      });
    }

    case "today_summary": {
      const date = String(body.date ?? new Date().toISOString().slice(0, 10));
      const [{ data: invoices }, { data: payments }, { data: expenses }] = await Promise.all([
        admin
          .from("aimunim_invoices")
          .select("total_paise, voucher_type")
          .eq("tenant_id", tenantId)
          .eq("direction", "sale")
          .eq("voucher_type", "invoice")
          .neq("status", "draft")
          .eq("invoice_date", date),
        admin
          .from("aimunim_payments")
          .select("amount_paise, mode, direction")
          .eq("tenant_id", tenantId)
          .eq("payment_date", date),
        admin
          .from("aimunim_expenses")
          .select("amount_paise")
          .eq("tenant_id", tenantId)
          .eq("expense_date", date),
      ]);

      const salesPaise = (invoices ?? []).reduce((s, i) => s + i.total_paise, 0);
      const byMode: Record<string, number> = {};
      let inPaise = 0;
      for (const p of payments ?? []) {
        if (p.direction !== "in") continue;
        inPaise += p.amount_paise;
        byMode[p.mode] = (byMode[p.mode] ?? 0) + p.amount_paise;
      }
      const expensePaise = (expenses ?? []).reduce((s, e) => s + e.amount_paise, 0);
      const creditPaise = Math.max(0, salesPaise - inPaise);

      return NextResponse.json({
        ok: true,
        date,
        sales: formatINR(salesPaise),
        sales_paise: salesPaise,
        bills: (invoices ?? []).length,
        received_paise: inPaise,
        received_by_mode: Object.fromEntries(
          Object.entries(byMode).map(([m, v]) => [m, formatINR(v)]),
        ),
        credit_given: formatINR(creditPaise),
        expenses: formatINR(expensePaise),
      });
    }

    case "outstanding_list": {
      const { data: parties } = await admin
        .from("aimunim_parties")
        .select("name, phone, balance_paise")
        .eq("tenant_id", tenantId)
        .gt("balance_paise", 0)
        .order("balance_paise", { ascending: false })
        .limit(25);
      const totalPaise = (parties ?? []).reduce((s, p) => s + p.balance_paise, 0);
      return NextResponse.json({
        ok: true,
        total_outstanding: formatINR(totalPaise),
        count: (parties ?? []).length,
        parties: (parties ?? []).map((p) => ({
          name: p.name,
          phone: p.phone,
          outstanding: formatINR(p.balance_paise),
          outstanding_paise: p.balance_paise,
        })),
      });
    }

    case "party_summary": {
      const party = await resolveParty(body.party as { name?: string; phone?: string });
      if (!party) return NextResponse.json({ error: "Party nahi mili." }, { status: 404 });
      const monthStart = new Date().toISOString().slice(0, 8) + "01";
      const { data: bills } = await admin
        .from("aimunim_invoices")
        .select("invoice_number, invoice_date, total_paise, status")
        .eq("tenant_id", tenantId)
        .eq("party_id", party.id)
        .eq("voucher_type", "invoice")
        .neq("status", "draft")
        .order("invoice_date", { ascending: false })
        .limit(10);
      const monthPaise = (bills ?? [])
        .filter((b) => b.invoice_date >= monthStart)
        .reduce((s, b) => s + b.total_paise, 0);
      return NextResponse.json({
        ok: true,
        party: party.name,
        phone: party.phone,
        outstanding: formatINR(Math.max(0, party.balance_paise)),
        outstanding_paise: party.balance_paise,
        this_month_total: formatINR(monthPaise),
        recent_bills: (bills ?? []).map((b) => ({
          number: b.invoice_number,
          date: b.invoice_date,
          total: formatINR(b.total_paise),
          status: b.status,
        })),
      });
    }

    case "lookup_item": {
      const q = String(body.item ?? "");
      if (!q) return NextResponse.json({ error: "item is required" }, { status: 400 });
      const { data: items } = await admin
        .from("aimunim_items")
        .select("name, unit, sale_price_paise, wholesale_price_paise, tax_rate, stock_qty, type")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .ilike("name", `%${q}%`)
        .limit(5);
      return NextResponse.json({
        ok: true,
        items: (items ?? []).map((i) => ({
          name: i.name,
          retail: formatINR(i.sale_price_paise),
          wholesale: i.wholesale_price_paise > 0 ? formatINR(i.wholesale_price_paise) : null,
          gst_percent: i.tax_rate,
          stock: i.type === "product" ? `${i.stock_qty} ${i.unit}` : null,
        })),
      });
    }

    case "update_item_price": {
      const q = String(body.item ?? "");
      if (!q) return NextResponse.json({ error: "item is required" }, { status: 400 });
      const { data: item } = await admin
        .from("aimunim_items")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .ilike("name", `%${q}%`)
        .limit(1)
        .maybeSingle();
      if (!item) return NextResponse.json({ error: `"${q}" catalog me nahi mila.` }, { status: 404 });

      const patch: { sale_price_paise?: number; wholesale_price_paise?: number } = {};
      if (body.price != null) patch.sale_price_paise = rupeesToPaise(Number(body.price));
      if (body.wholesale_price != null)
        patch.wholesale_price_paise = rupeesToPaise(Number(body.wholesale_price));
      if (!Object.keys(patch).length)
        return NextResponse.json({ error: "price ya wholesale_price required" }, { status: 400 });

      const { error } = await admin
        .from("aimunim_items")
        .update(patch)
        .eq("tenant_id", tenantId)
        .eq("id", item.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, item: item.name, updated: Object.keys(patch) });
    }

    case "low_stock": {
      const { data: items } = await admin
        .from("aimunim_items")
        .select("name, unit, stock_qty, low_stock_level")
        .eq("tenant_id", tenantId)
        .eq("type", "product")
        .eq("is_active", true);
      const low = (items ?? [])
        .filter((i) => i.stock_qty <= i.low_stock_level)
        .map((i) => ({
          name: i.name,
          stock: `${i.stock_qty} ${i.unit}`,
          reorder_level: `${i.low_stock_level} ${i.unit}`,
        }));
      return NextResponse.json({ ok: true, count: low.length, items: low });
    }

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
