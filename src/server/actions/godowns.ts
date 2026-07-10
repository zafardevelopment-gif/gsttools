"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";

export type ActionResult = { ok?: true; error?: string };

const godownSchema = z.object({
  name: z.string().trim().min(1, "Godown name is required."),
  address: z.string().trim().optional(),
});

export async function createGodownAction(
  input: z.input<typeof godownSchema>,
): Promise<ActionResult> {
  const parsed = godownSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase.from("aimunim_godowns").insert({
    tenant_id: tenantId,
    name: v.name,
    address: v.address || null,
  });
  if (error) {
    return {
      error:
        error.code === "23505" ? `Godown "${v.name}" already exists.` : error.message,
    };
  }
  revalidatePath("/godowns");
  return { ok: true };
}

const transferSchema = z.object({
  itemId: z.guid(),
  fromGodownId: z.guid(),
  toGodownId: z.guid(),
  qty: z.coerce.number().positive("Qty must be > 0."),
  notes: z.string().trim().optional(),
});

/**
 * Move stock between godowns: two movements (−qty from source, +qty into
 * destination). Total item stock stays unchanged; per-godown stock shifts via
 * the stock-movement trigger.
 */
export async function transferStockAction(
  input: z.input<typeof transferSchema>,
): Promise<ActionResult> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;
  if (v.fromGodownId === v.toGodownId) return { error: "From and To must differ." };

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  // Don't allow moving more than the source godown holds.
  const { data: srcStock } = await supabase
    .from("aimunim_item_stocks")
    .select("qty")
    .eq("item_id", v.itemId)
    .eq("godown_id", v.fromGodownId)
    .maybeSingle();
  if ((srcStock?.qty ?? 0) < v.qty) {
    return {
      error: `Source godown has only ${srcStock?.qty ?? 0} in stock.`,
    };
  }

  const { error } = await supabase.from("aimunim_stock_movements").insert([
    {
      tenant_id: tenantId,
      item_id: v.itemId,
      qty_delta: -v.qty,
      type: "adjustment" as const,
      godown_id: v.fromGodownId,
      notes: v.notes || "Godown transfer (out)",
      created_by: userId,
    },
    {
      tenant_id: tenantId,
      item_id: v.itemId,
      qty_delta: v.qty,
      type: "adjustment" as const,
      godown_id: v.toGodownId,
      notes: v.notes || "Godown transfer (in)",
      created_by: userId,
    },
  ]);
  if (error) return { error: error.message };
  revalidatePath("/godowns");
  revalidatePath("/items");
  return { ok: true };
}

const assignSchema = z.object({
  itemId: z.guid(),
  godownId: z.guid(),
  qty: z.coerce.number().positive("Qty must be > 0."),
});

/**
 * Put existing (unassigned) stock into a godown. Uses a paired movement so the
 * item's total stock stays unchanged: −qty global, +qty in the godown.
 */
export async function assignStockToGodownAction(
  input: z.input<typeof assignSchema>,
): Promise<ActionResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const { error } = await supabase.from("aimunim_stock_movements").insert([
    {
      tenant_id: tenantId,
      item_id: v.itemId,
      qty_delta: -v.qty,
      type: "adjustment" as const,
      notes: "Assigned to godown",
      created_by: userId,
    },
    {
      tenant_id: tenantId,
      item_id: v.itemId,
      qty_delta: v.qty,
      type: "adjustment" as const,
      godown_id: v.godownId,
      notes: "Assigned to godown",
      created_by: userId,
    },
  ]);
  if (error) return { error: error.message };
  revalidatePath("/godowns");
  revalidatePath("/items");
  return { ok: true };
}
