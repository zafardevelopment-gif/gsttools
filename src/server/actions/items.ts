"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { itemFormSchema } from "@/lib/validation/item";
import { rupeesToPaise } from "@/lib/money";

export type ActionResult = { ok?: true; error?: string };

function parseItem(formData: FormData) {
  return itemFormSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    sku: formData.get("sku") ?? undefined,
    hsn_sac: formData.get("hsn_sac") ?? undefined,
    unit: formData.get("unit") ?? "PCS",
    category: formData.get("category") ?? undefined,
    sale_price: formData.get("sale_price") ?? 0,
    purchase_price: formData.get("purchase_price") ?? 0,
    tax_rate: formData.get("tax_rate") ?? 0,
    is_tax_inclusive: formData.get("is_tax_inclusive") === "true",
    opening_stock: formData.get("opening_stock") ?? 0,
    low_stock_level: formData.get("low_stock_level") ?? 0,
  });
}

export async function createItemAction(formData: FormData): Promise<ActionResult> {
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("GST_items")
    .insert({
      tenant_id: tenantId,
      type: v.type,
      name: v.name,
      sku: v.sku || null,
      hsn_sac: v.hsn_sac || null,
      unit: v.unit,
      category: v.category || null,
      sale_price_paise: rupeesToPaise(v.sale_price),
      purchase_price_paise: rupeesToPaise(v.purchase_price),
      tax_rate: v.tax_rate,
      is_tax_inclusive: v.is_tax_inclusive,
      stock_qty: 0, // opening posted as a movement below
      low_stock_level: v.type === "product" ? v.low_stock_level : 0,
    })
    .select("id")
    .single();

  if (error || !item) return { error: error?.message ?? "Could not create item." };

  // Opening stock → ledger movement (trigger updates items.stock_qty).
  if (v.type === "product" && v.opening_stock > 0) {
    await supabase.from("GST_stock_movements").insert({
      tenant_id: tenantId,
      item_id: item.id,
      qty_delta: v.opening_stock,
      type: "opening",
      notes: "Opening stock",
    });
  }

  revalidatePath("/items");
  return { ok: true };
}

export async function updateItemAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  // Note: stock_qty is not edited here (it's driven by movements). low_stock is.
  const { error } = await supabase
    .from("GST_items")
    .update({
      type: v.type,
      name: v.name,
      sku: v.sku || null,
      hsn_sac: v.hsn_sac || null,
      unit: v.unit,
      category: v.category || null,
      sale_price_paise: rupeesToPaise(v.sale_price),
      purchase_price_paise: rupeesToPaise(v.purchase_price),
      tax_rate: v.tax_rate,
      is_tax_inclusive: v.is_tax_inclusive,
      low_stock_level: v.type === "product" ? v.low_stock_level : 0,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };
  revalidatePath("/items");
  return { ok: true };
}

export async function deleteItemAction(id: string): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("GST_items")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/items");
  return { ok: true };
}
