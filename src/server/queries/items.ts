import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import type { ItemRow } from "@/lib/database.types";

export async function listItems(search?: string): Promise<ItemRow[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  let q = supabase
    .from("GST_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (search?.trim()) q = q.ilike("name", `%${search.trim()}%`);
  const { data } = await q;
  return data ?? [];
}

export async function getLowStockItems(): Promise<ItemRow[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("GST_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("type", "product");
  return (data ?? []).filter((i) => i.stock_qty <= i.low_stock_level);
}
