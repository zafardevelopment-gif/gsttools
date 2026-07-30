import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { getBillImageUrl } from "@/server/services/bill-scan";
import type { BillScanRow } from "@/lib/database.types";

export type BillScanWithUrl = BillScanRow & { imageUrl: string | null };

export async function listBillScans(): Promise<BillScanWithUrl[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("aimunim_bill_scans")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  return Promise.all(
    rows.map(async (row) => ({ ...row, imageUrl: await getBillImageUrl(row.image_path) })),
  );
}

export async function getBillScan(id: string): Promise<BillScanWithUrl | null> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("aimunim_bill_scans")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (!data) return null;
  return { ...data, imageUrl: await getBillImageUrl(data.image_path) };
}
