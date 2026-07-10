"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";

export type ActionResult = { ok?: true; error?: string };

const statusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["new", "confirmed", "dispatched", "delivered", "cancelled"]),
});

export async function updateOrderStatusAction(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_online_orders")
    .update({ status: v.status })
    .eq("tenant_id", tenantId)
    .eq("id", v.orderId);
  if (error) return { error: error.message };
  revalidatePath("/orders");
  return { ok: true };
}
