"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { getBillImageUrl, createBillScan, confirmBillScan } from "@/server/services/bill-scan";
import { BILL_SCAN_TYPES, type BillScanType } from "@/lib/validation/bill-scan";
import type { BillScanRow } from "@/lib/database.types";

export type ActionResult = { ok?: true; error?: string };
export type ScanBillResult = ActionResult & { row?: BillScanRow; imageUrl?: string | null };

function asType(v: FormDataEntryValue | null): BillScanType {
  return (BILL_SCAN_TYPES as readonly string[]).includes(v as string)
    ? (v as BillScanType)
    : "expense";
}

/** Upload a bill photo and run AI extraction. Returns a 'pending' row for review. */
export async function scanBillAction(formData: FormData): Promise<ScanBillResult> {
  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return { error: "Bill image select karein." };

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const res = await createBillScan({
    db: supabase,
    tenantId,
    userId,
    file,
    type: asType(formData.get("type")),
  });
  if (res.error || !res.row) return { error: res.error ?? "Scan failed." };

  revalidatePath("/bill-scan");
  const imageUrl = await getBillImageUrl(res.row.image_path);
  return { ok: true, row: res.row, imageUrl };
}

/** Owner confirms (possibly edited) extracted fields; posts an expense if applicable. */
export async function confirmBillScanAction(formData: FormData): Promise<ActionResult> {
  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();

  const res = await confirmBillScan({
    db: supabase,
    tenantId,
    userId,
    input: {
      id: formData.get("id") as string,
      type: asType(formData.get("type")),
      vendor_name: (formData.get("vendor_name") as string) || undefined,
      amount: formData.get("amount") ?? 0,
      bill_date: formData.get("bill_date") as string,
      category: formData.get("category") as string,
      notes: (formData.get("notes") as string) || undefined,
    },
  });
  if (res.error) return { error: res.error };

  revalidatePath("/bill-scan");
  revalidatePath("/expenses");
  return { ok: true };
}

export async function deleteBillScanAction(id: string): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("aimunim_bill_scans")
    .select("image_path")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  const { error } = await supabase
    .from("aimunim_bill_scans")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  if (row?.image_path) {
    void createAdminClient().storage.from("bill-scans").remove([row.image_path]);
  }

  revalidatePath("/bill-scan");
  return { ok: true };
}
