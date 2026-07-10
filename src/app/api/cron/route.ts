import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendNotification } from "@/server/notifications";
import {
  computeInvoiceTotals,
  isInterstateSupply,
  type GstLineInput,
} from "@/lib/gst";
import { formatINR } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduler endpoint — run daily (Supabase cron / GitHub Action / n8n):
 *   curl -X POST https://<app>/api/cron -H "Authorization: Bearer $CRON_SECRET"
 *
 * 1. Generates due recurring invoices (Automated Bills) and auto-shares them.
 * 2. Sends payment reminders per each tenant's reminder rules.
 */

type SnapshotLine = {
  item_id: string | null;
  name: string;
  hsn_sac: string | null;
  unit: string;
  qty: number;
  rate_paise: number;
  tax_rate: number;
};

/** FY tag like 2627 for Apr-2026..Mar-2027. */
function fyTag(d = new Date()): string {
  const start = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

/**
 * Bump the voucher counter without the RLS-bound RPC (cron has no auth.uid).
 * Cron runs single-threaded, so read+update is safe enough here.
 */
async function nextInvoiceNumber(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  prefix: string,
): Promise<string> {
  const { data: counter } = await admin
    .from("aimunim_invoice_counters")
    .select("last_seq")
    .eq("tenant_id", tenantId)
    .eq("direction", "sale")
    .eq("voucher_type", "invoice")
    .maybeSingle();

  const seq = (counter?.last_seq ?? 0) + 1;
  await admin
    .from("aimunim_invoice_counters")
    .upsert(
      { tenant_id: tenantId, direction: "sale", voucher_type: "invoice", last_seq: seq },
      { onConflict: "tenant_id,direction,voucher_type" },
    );
  return `${prefix}/${fyTag()}/${String(seq).padStart(5, "0")}`;
}

function advance(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  if (frequency === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const results = { invoicesCreated: 0, remindersSent: 0, errors: [] as string[] };

  // ---- 1. Due recurring invoices ---------------------------------------------
  const { data: due } = await admin
    .from("aimunim_recurring_invoices")
    .select("*")
    .eq("is_active", true)
    .lte("next_run_date", today)
    .limit(200);

  for (const rec of due ?? []) {
    try {
      const [{ data: tenant }, { data: party }] = await Promise.all([
        admin
          .from("aimunim_tenants")
          .select("state_code, invoice_prefix")
          .eq("id", rec.tenant_id)
          .single(),
        admin
          .from("aimunim_parties")
          .select("name, phone, state_code, gstin")
          .eq("id", rec.party_id)
          .single(),
      ]);
      if (!tenant || !party) throw new Error("Tenant/party missing");

      const lines = (rec.items as SnapshotLine[]) ?? [];
      if (!lines.length) throw new Error("No items in recurring bill");

      const placeOfSupply = party.state_code || party.gstin?.slice(0, 2) || undefined;
      const interstate = isInterstateSupply(tenant.state_code, placeOfSupply);

      const calcLines: GstLineInput[] = lines.map((l) => ({
        qty: l.qty,
        ratePaise: l.rate_paise,
        taxRate: l.tax_rate,
        discountPercent: 0,
      }));
      const totals = computeInvoiceTotals({
        lines: calcLines,
        isInterstate: interstate,
        invoiceType: "gst",
        additionalChargesPaise: 0,
        roundOff: true,
      });

      const number = await nextInvoiceNumber(
        admin,
        rec.tenant_id,
        tenant.invoice_prefix ?? "INV",
      );

      const { data: invoice, error: invErr } = await admin
        .from("aimunim_invoices")
        .insert({
          tenant_id: rec.tenant_id,
          party_id: rec.party_id,
          direction: "sale",
          voucher_type: "invoice",
          invoice_type: "gst",
          invoice_number: number,
          invoice_date: today,
          place_of_supply_state: placeOfSupply ?? null,
          is_interstate: interstate,
          subtotal_paise: totals.subtotalPaise,
          discount_paise: totals.discountPaise,
          taxable_value_paise: totals.taxableValuePaise,
          cgst_paise: totals.cgstPaise,
          sgst_paise: totals.sgstPaise,
          igst_paise: totals.igstPaise,
          total_tax_paise: totals.totalTaxPaise,
          additional_charges_paise: 0,
          round_off_paise: totals.roundOffPaise,
          total_paise: totals.totalPaise,
          status: "unpaid",
          template: "classic",
          notes: `Auto-generated by recurring bill "${rec.name}"`,
        })
        .select("id")
        .single();
      if (invErr || !invoice) throw new Error(invErr?.message ?? "Insert failed");

      await admin.from("aimunim_invoice_items").insert(
        lines.map((l, i) => ({
          tenant_id: rec.tenant_id,
          invoice_id: invoice.id,
          item_id: l.item_id,
          line_no: i + 1,
          name: l.name,
          hsn_sac: l.hsn_sac,
          unit: l.unit,
          qty: l.qty,
          rate_paise: l.rate_paise,
          discount_percent: 0,
          discount_paise: totals.lines[i].discountPaise,
          taxable_value_paise: totals.lines[i].taxableValuePaise,
          tax_rate: totals.lines[i].taxRate,
          cgst_paise: totals.lines[i].cgstPaise,
          sgst_paise: totals.lines[i].sgstPaise,
          igst_paise: totals.lines[i].igstPaise,
          amount_paise: totals.lines[i].amountPaise,
        })),
      );

      // Stock out for product lines.
      const itemIds = lines.map((l) => l.item_id).filter(Boolean) as string[];
      if (itemIds.length) {
        const { data: items } = await admin
          .from("aimunim_items")
          .select("id, type")
          .in("id", itemIds);
        const productIds = new Set(
          (items ?? []).filter((i) => i.type === "product").map((i) => i.id),
        );
        const moves = lines
          .filter((l) => l.item_id && productIds.has(l.item_id))
          .map((l) => ({
            tenant_id: rec.tenant_id,
            item_id: l.item_id as string,
            qty_delta: -l.qty,
            type: "sale" as const,
            reference_type: "invoice",
            reference_id: invoice.id,
          }));
        if (moves.length) await admin.from("aimunim_stock_movements").insert(moves);
      }

      await admin
        .from("aimunim_recurring_invoices")
        .update({
          next_run_date: advance(rec.next_run_date, rec.frequency),
          last_run_at: new Date().toISOString(),
        })
        .eq("id", rec.id);

      if (rec.auto_share && party.phone) {
        const pdfUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/invoices/${invoice.id}/pdf`;
        await sendNotification({
          tenantId: rec.tenant_id,
          type: "invoice_generated",
          recipient: party.phone,
          body: `Dear ${party.name}, your invoice ${number} of ${formatINR(totals.totalPaise)} has been generated. View: ${pdfUrl}`,
          params: { name: party.name, number, amount: (totals.totalPaise / 100).toFixed(2), link: pdfUrl },
          entityType: "invoice",
          entityId: invoice.id,
        });
      }

      results.invoicesCreated += 1;
    } catch (e) {
      results.errors.push(`recurring ${rec.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ---- 2. Payment reminders per tenant rules ----------------------------------
  const { data: rules } = await admin
    .from("aimunim_reminder_rules")
    .select("*")
    .eq("enabled", true);

  for (const rule of rules ?? []) {
    try {
      // offset_days: -3 => remind 3 days BEFORE due; +7 => 7 days AFTER.
      const target = new Date();
      target.setUTCDate(target.getUTCDate() - rule.offset_days);
      const targetDate = target.toISOString().slice(0, 10);

      const { data: invoices } = await admin
        .from("aimunim_invoices")
        .select("id, invoice_number, party_id, total_paise, amount_paid_paise, due_date")
        .eq("tenant_id", rule.tenant_id)
        .eq("direction", "sale")
        .eq("voucher_type", "invoice")
        .eq("due_date", targetDate)
        .in("status", ["unpaid", "partial"]);

      for (const inv of invoices ?? []) {
        if (!inv.party_id) continue;
        const { data: party } = await admin
          .from("aimunim_parties")
          .select("name, phone")
          .eq("id", inv.party_id)
          .single();
        if (!party?.phone) continue;
        const duePaise = inv.total_paise - inv.amount_paid_paise;
        await sendNotification({
          tenantId: rule.tenant_id,
          type: "payment_reminder",
          recipient: party.phone,
          body: `Dear ${party.name}, invoice ${inv.invoice_number} of ${formatINR(duePaise)} is ${rule.offset_days >= 0 ? "overdue" : "due soon"} (due ${inv.due_date}). Kindly arrange the payment.`,
          params: { name: party.name, number: inv.invoice_number, amount: (duePaise / 100).toFixed(2) },
          entityType: "invoice",
          entityId: inv.id,
        });
        results.remindersSent += 1;
      }
    } catch (e) {
      results.errors.push(`rule ${rule.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  return NextResponse.json({ ok: true, date: today, ...results });
}
