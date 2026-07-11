"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { itemFormSchema, type ItemFormValues } from "@/lib/validation/item";
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
    barcode: formData.get("barcode") ?? undefined,
    mrp: formData.get("mrp") ?? 0,
    wholesale_price: formData.get("wholesale_price") ?? 0,
    description: formData.get("description") ?? undefined,
    alt_unit: formData.get("alt_unit") ?? undefined,
    alt_unit_factor: formData.get("alt_unit_factor") ?? 0,
  });
}

/** Upload an item photo (logos bucket) and return its path, or null. */
async function uploadItemImage(
  tenantId: string,
  itemId: string,
  file: File | null,
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > 3 * 1024 * 1024) throw new Error("Image max 3 MB honi chahiye.");
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    throw new Error("PNG/JPG/WEBP image hi chalegi.");
  }
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${tenantId}/items/${itemId}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("logos")
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (error) throw new Error(error.message);
  return path;
}

/** Shared column payload for the new (0007) item fields. */
function extraItemColumns(v: ItemFormValues) {
  return {
    barcode: v.barcode || null,
    mrp_paise: rupeesToPaise(v.mrp),
    wholesale_price_paise: rupeesToPaise(v.wholesale_price),
    description: v.description || null,
    alt_unit: v.alt_unit || null,
    alt_unit_factor: v.alt_unit && v.alt_unit_factor > 0 ? v.alt_unit_factor : null,
  };
}

export async function createItemAction(formData: FormData): Promise<ActionResult> {
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("aimunim_items")
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
      ...extraItemColumns(v),
    })
    .select("id")
    .single();

  if (error || !item) return { error: error?.message ?? "Could not create item." };

  // Optional photo (shown on the storefront and item list).
  try {
    const imagePath = await uploadItemImage(
      tenantId,
      item.id,
      formData.get("image") as File | null,
    );
    if (imagePath) {
      await supabase.from("aimunim_items").update({ image_path: imagePath }).eq("id", item.id);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Image upload failed." };
  }

  // Opening stock → ledger movement (trigger updates items.stock_qty).
  if (v.type === "product" && v.opening_stock > 0) {
    await supabase.from("aimunim_stock_movements").insert({
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
    .from("aimunim_items")
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
      ...extraItemColumns(v),
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  try {
    const imagePath = await uploadItemImage(
      tenantId,
      id,
      formData.get("image") as File | null,
    );
    if (imagePath) {
      await supabase.from("aimunim_items").update({ image_path: imagePath }).eq("id", id);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Image upload failed." };
  }

  revalidatePath("/items");
  return { ok: true };
}

export async function deleteItemAction(id: string): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_items")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/items");
  return { ok: true };
}
