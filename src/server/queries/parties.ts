import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import type { PartyRow } from "@/lib/database.types";

export async function listParties(opts?: {
  type?: "customer" | "supplier";
  search?: string;
}): Promise<PartyRow[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  let q = supabase
    .from("aimunim_parties")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  // 'both' parties are included for either filter.
  if (opts?.type) q = q.in("type", [opts.type, "both"]);
  if (opts?.search?.trim()) q = q.ilike("name", `%${opts.search.trim()}%`);
  const { data } = await q;
  return data ?? [];
}

export async function getParty(id: string): Promise<PartyRow | null> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("aimunim_parties")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}
