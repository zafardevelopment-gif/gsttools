"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE } from "@/lib/tenant";
import { businessSetupSchema } from "@/lib/validation/onboarding";

export type ActionResult = { error?: string };

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Create the user's business (tenant + owner membership + trial subscription via
 * the gst_create_tenant_with_owner RPC), optionally upload a logo, set the
 * active-tenant cookie, then redirect into the app.
 */
export async function createBusinessAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  const { data: tenantId, error } = await supabase.rpc(
    "gst_create_tenant_with_owner",
    {
      p_name: v.name,
      p_state_code: v.state_code,
      p_gstin: v.gstin ?? null,
      p_legal_name: v.legal_name ?? null,
      p_address_line1: v.address_line1 ?? null,
      p_address_line2: v.address_line2 ?? null,
      p_city: v.city ?? null,
      p_state: v.state ?? null,
      p_pincode: v.pincode ?? null,
      p_phone: v.phone ?? null,
      p_email: v.email ?? null,
    },
  );

  if (error || !tenantId) {
    return { error: error?.message ?? "Could not create business." };
  }

  // Optional logo upload (membership now exists, so storage RLS allows it).
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size <= MAX_LOGO_BYTES && logo.type.startsWith("image/")) {
      const ext = logo.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${tenantId}/logo.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("logos")
        .upload(path, logo, { upsert: true, contentType: logo.type });
      if (!upErr) {
        await supabase
          .from("GST_tenants")
          .update({ logo_path: path })
          .eq("id", tenantId);
      }
      // A logo failure is non-fatal — continue into the app.
    }
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}
