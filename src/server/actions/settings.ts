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
    .from("aimunim_tenants")
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

/**
 * Update invoice/print/notification preferences (owner/admin only):
 * default paper size, notification channel.
 */
export async function updatePreferencesAction(input: {
  paper?: string;
  notificationChannel?: string;
  storeEnabled?: boolean;
  storeSlug?: string;
}): Promise<ActionResult> {
  const { tenantId, role } = await requireActiveContext();
  if (role !== "owner" && role !== "admin") {
    return { error: "Only an owner or admin can edit preferences." };
  }

  const paper = ["A4", "A5", "THERMAL"].includes(input.paper ?? "")
    ? input.paper
    : "A4";
  const channel = ["whatsapp", "sms", "both"].includes(input.notificationChannel ?? "")
    ? input.notificationChannel
    : "whatsapp";

  const slug = (input.storeSlug ?? "").trim().toLowerCase();
  if (input.storeEnabled && !/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) {
    return {
      error: "Store link me sirf letters, numbers, dash — e.g. sharma-traders",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_tenants")
    .update({
      print_settings: { paper },
      notification_channel: channel as "whatsapp" | "sms" | "both",
      store_enabled: !!input.storeEnabled,
      store_slug: slug || null,
    })
    .eq("id", tenantId);

  if (error) {
    return {
      error: error.code === "23505" ? "Ye store link kisi aur business ne le liya hai." : error.message,
    };
  }
  revalidatePath("/settings");
  return { ok: true };
}
