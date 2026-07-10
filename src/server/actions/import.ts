"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { parseCsvWithHeader } from "@/lib/csv";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/server/audit";

export type ImportResult = {
  imported?: number;
  skipped?: { row: number; reason: string }[];
  error?: string;
};

const MAX_ROWS = 1000;

/**
 * Bulk-import items from CSV text.
 * Columns (header row, any order): name*, type (product|service), sku, hsn,
 * unit, category, sale_price, purchase_price, mrp, tax_rate, opening_stock,
 * low_stock_level, barcode, description
 */
export async function importItemsAction(csvText: string): Promise<ImportResult> {
  const rows = parseCsvWithHeader(csvText);
  if (!rows) return { error: "CSV me header + kam se kam ek row honi chahiye." };
  if (rows.length > MAX_ROWS) return { error: `Ek baar me max ${MAX_ROWS} rows.` };

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const skipped: { row: number; reason: string }[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 2; // 1-based + header
    const name = r.name;
    if (!name) {
      skipped.push({ row: rowNo, reason: "name missing" });
      continue;
    }
    const type = r.type === "service" ? "service" : "product";
    const taxRate = Number(r.tax_rate ?? 0) || 0;
    if (taxRate < 0 || taxRate > 100) {
      skipped.push({ row: rowNo, reason: "invalid tax_rate" });
      continue;
    }

    const { data: item, error } = await supabase
      .from("aimunim_items")
      .insert({
        tenant_id: tenantId,
        type,
        name,
        sku: r.sku || null,
        hsn_sac: r.hsn || r.hsn_sac || null,
        unit: (r.unit || "PCS").toUpperCase(),
        category: r.category || null,
        sale_price_paise: rupeesToPaise(Number(r.sale_price ?? 0) || 0),
        purchase_price_paise: rupeesToPaise(Number(r.purchase_price ?? 0) || 0),
        mrp_paise: rupeesToPaise(Number(r.mrp ?? 0) || 0),
        tax_rate: taxRate,
        stock_qty: 0,
        low_stock_level: type === "product" ? Number(r.low_stock_level ?? 0) || 0 : 0,
        barcode: r.barcode || null,
        description: r.description || null,
      })
      .select("id")
      .single();

    if (error || !item) {
      skipped.push({ row: rowNo, reason: error?.message ?? "insert failed" });
      continue;
    }

    const opening = Number(r.opening_stock ?? 0) || 0;
    if (type === "product" && opening > 0) {
      await supabase.from("aimunim_stock_movements").insert({
        tenant_id: tenantId,
        item_id: item.id,
        qty_delta: opening,
        type: "opening",
        notes: "Opening stock (bulk import)",
      });
    }
    imported++;
  }

  logAudit({
    tenantId,
    userId,
    action: "items.bulk_imported",
    entityType: "item",
    data: { imported, skipped: skipped.length },
  });
  revalidatePath("/items");
  return { imported, skipped };
}

/**
 * Bulk-import parties from CSV text.
 * Columns: name*, type (customer|supplier|both), gstin, state_code, phone,
 * email, billing_address, opening_balance, pan, category, credit_period_days,
 * credit_limit
 */
export async function importPartiesAction(csvText: string): Promise<ImportResult> {
  const rows = parseCsvWithHeader(csvText);
  if (!rows) return { error: "CSV me header + kam se kam ek row honi chahiye." };
  if (rows.length > MAX_ROWS) return { error: `Ek baar me max ${MAX_ROWS} rows.` };

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const skipped: { row: number; reason: string }[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 2;
    if (!r.name) {
      skipped.push({ row: rowNo, reason: "name missing" });
      continue;
    }
    const type = ["customer", "supplier", "both"].includes(r.type) ? r.type : "customer";
    const gstin = (r.gstin || "").toUpperCase() || null;
    const stateCode = r.state_code || gstin?.slice(0, 2) || null;
    const openingPaise = rupeesToPaise(Number(r.opening_balance ?? 0) || 0);

    const { error } = await supabase.from("aimunim_parties").insert({
      tenant_id: tenantId,
      type: type as "customer" | "supplier" | "both",
      name: r.name,
      gstin,
      state_code: stateCode && /^[0-9]{2}$/.test(stateCode) ? stateCode : null,
      phone: r.phone || null,
      email: r.email || null,
      billing_address: r.billing_address || null,
      opening_balance_paise: openingPaise,
      balance_paise: openingPaise,
      pan: (r.pan || "").toUpperCase() || null,
      category: r.category || null,
      credit_period_days: Math.max(0, Math.round(Number(r.credit_period_days ?? 0) || 0)),
      credit_limit_paise: rupeesToPaise(Number(r.credit_limit ?? 0) || 0),
    });

    if (error) {
      skipped.push({ row: rowNo, reason: error.message });
      continue;
    }
    imported++;
  }

  logAudit({
    tenantId,
    userId,
    action: "parties.bulk_imported",
    entityType: "party",
    data: { imported, skipped: skipped.length },
  });
  revalidatePath("/parties");
  return { imported, skipped };
}
