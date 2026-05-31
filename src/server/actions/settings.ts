"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { businessSetupSchema } from "@/lib/validation/onboarding";

export type ActionResult = { ok?: true; error?: string };

/** Update the active tenant's business profile. Owner/admin only. */
export async function updateBusinessAction(formData: FormData): Promise<ActionResult> {
  const { tenantId, role } = await requireActiveContext();
  if (role !== "owner" && role !== "admin") {
    return { error: "Only an owner or admin can edit business details." };
  }

  const parsed = businessSetupSchema.safeParse({
    name: formData.get("name"),
    legal_name: formData.get("legal_name") ?? undefined,
    gstin: formData.get("gstin") ?? "",
    state_code: formData.get("state_code"),
    address_line1: formData.get("address_line1") ?? undefined,
    address_line2: formData.get("address_line2") ?? undefined,
    city: formData.get("city") ?? undefined,
    state: formData.get("state") ?? undefined,
    pincode: formData.get("pincode") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;

  const supabase = await createClient();
  const invoicePrefix = (formData.get("invoice_prefix") as string)?.trim();

  const { error } = await supabase
    .from("GST_tenants")
    .update({
      name: v.name,
      legal_name: v.legal_name || null,
      gstin: v.gstin ?? null,
      state_code: v.state_code,
      address_line1: v.address_line1 || null,
      address_line2: v.address_line2 || null,
      city: v.city || null,
      state: v.state || null,
      pincode: v.pincode ?? null,
      phone: v.phone ?? null,
      email: v.email ?? null,
      ...(invoicePrefix ? { invoice_prefix: invoicePrefix } : {}),
    })
    .eq("id", tenantId);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
