"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { sendNotification } from "@/server/notifications";

export type PlaceOrderResult = { orderNumber?: string; error?: string };

const orderSchema = z.object({
  slug: z.string().trim().min(1),
  customerName: z.string().trim().min(1, "Apna naam likhen."),
  customerPhone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{10,15}$/, "Sahi phone number likhen."),
  address: z.string().trim().optional(),
  paymentMode: z.enum(["cod", "upi", "online"]).default("cod"),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        qty: z.coerce.number().positive(),
      }),
    )
    .min(1, "Cart khali hai."),
});

/**
 * Public storefront checkout — no auth; the store slug identifies the tenant.
 * Prices are re-read from the item master (client totals are never trusted).
 */
export async function placeOrderAction(
  input: z.input<typeof orderSchema>,
): Promise<PlaceOrderResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid order." };
  const v = parsed.data;

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("aimunim_tenants")
    .select("id, name, phone, store_enabled")
    .eq("store_slug", v.slug)
    .maybeSingle();
  if (!tenant?.store_enabled) return { error: "Ye store abhi available nahi hai." };

  const itemIds = v.lines.map((l) => l.itemId);
  const { data: items } = await admin
    .from("aimunim_items")
    .select("id, name, sale_price_paise, is_active")
    .eq("tenant_id", tenant.id)
    .in("id", itemIds);
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));

  const orderItems: { item_id: string; name: string; qty: number; rate_paise: number; amount_paise: number }[] = [];
  for (const l of v.lines) {
    const item = itemById.get(l.itemId);
    if (!item || !item.is_active) return { error: "Koi item ab available nahi hai — cart refresh karen." };
    orderItems.push({
      item_id: item.id,
      name: item.name,
      qty: l.qty,
      rate_paise: item.sale_price_paise,
      amount_paise: Math.round(item.sale_price_paise * l.qty),
    });
  }
  const totalPaise = orderItems.reduce((s, i) => s + i.amount_paise, 0);

  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
  const { error } = await admin.from("aimunim_online_orders").insert({
    tenant_id: tenant.id,
    order_number: orderNumber,
    customer_name: v.customerName,
    customer_phone: v.customerPhone,
    address: v.address || null,
    items: orderItems,
    total_paise: totalPaise,
    payment_mode: v.paymentMode,
  });
  if (error) return { error: error.message };

  // Notify the business owner about the new order (fire-and-forget).
  if (tenant.phone) {
    sendNotification({
      tenantId: tenant.id,
      type: "order_status",
      recipient: tenant.phone,
      body: `Naya online order ${orderNumber}: ${v.customerName} (${v.customerPhone}) — ₹${(totalPaise / 100).toFixed(2)}, ${orderItems.length} item(s).`,
      params: { order: orderNumber, name: v.customerName, amount: (totalPaise / 100).toFixed(2) },
      entityType: "online_order",
    }).catch(() => {});
  }

  return { orderNumber };
}
