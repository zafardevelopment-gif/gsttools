"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import type { InvoiceSettings } from "@/lib/database.types";

export type ActionResult = { ok?: true; error?: string };

function requireAdminRole(role: string): string | null {
  return role === "owner" || role === "admin"
    ? null
    : "Only an owner or admin can edit settings.";
}

// ---- Business extras (Manage Business tab) -----------------------------------
const extrasSchema = z.object({
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v === "" ? undefined : v))
    .optional()
    .refine((v) => v === undefined || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), "Invalid PAN."),
  upiId: z.string().trim().optional(),
  businessType: z.string().trim().optional(),
  industryType: z.string().trim().optional(),
  registrationType: z.string().trim().optional(),
  gstRegistered: z.boolean().default(true),
  tdsEnabled: z.boolean().default(false),
  tcsEnabled: z.boolean().default(false),
  defaultTerms: z.string().trim().optional(),
});

export async function updateBusinessExtrasAction(
  input: z.input<typeof extrasSchema>,
): Promise<ActionResult> {
  const parsed = extrasSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId, role } = await requireActiveContext();
  const roleErr = requireAdminRole(role);
  if (roleErr) return { error: roleErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_tenants")
    .update({
      pan: v.pan ?? null,
      upi_id: v.upiId || null,
      business_type: v.businessType || null,
      industry_type: v.industryType || null,
      registration_type: v.registrationType || null,
      gst_registered: v.gstRegistered,
      tds_enabled: v.tdsEnabled,
      tcs_enabled: v.tcsEnabled,
      default_terms: v.defaultTerms || null,
    })
    .eq("id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ---- Logo / signature upload (logos bucket, tenant-namespaced path) ----------
export async function uploadBrandingAction(formData: FormData): Promise<ActionResult> {
  const { tenantId, role } = await requireActiveContext();
  const roleErr = requireAdminRole(role);
  if (roleErr) return { error: roleErr };

  const kind = String(formData.get("kind") ?? "logo"); // "logo" | "signature"
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "File select karein." };
  if (file.size > 3 * 1024 * 1024) return { error: "Max 3 MB image." };
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    return { error: "PNG/JPG/WEBP image hi chalegi." };
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${tenantId}/${kind}.${ext}`;

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("logos")
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (upErr) return { error: upErr.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_tenants")
    .update(kind === "signature" ? { signature_path: path } : { logo_path: path })
    .eq("id", tenantId);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

// ---- Invoice display settings (jsonb merge) -----------------------------------
export async function updateInvoiceSettingsAction(
  patch: InvoiceSettings,
): Promise<ActionResult> {
  const { tenantId, role } = await requireActiveContext();
  const roleErr = requireAdminRole(role);
  if (roleErr) return { error: roleErr };

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("aimunim_tenants")
    .select("invoice_settings")
    .eq("id", tenantId)
    .single();

  const merged = { ...((tenant?.invoice_settings as InvoiceSettings) ?? {}), ...patch };
  const { error } = await supabase
    .from("aimunim_tenants")
    .update({ invoice_settings: merged })
    .eq("id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ---- Custom units (KG, QUINTAL, BORI, …) ---------------------------------------
export async function updateCustomUnitsAction(units: string[]): Promise<ActionResult> {
  const { tenantId, role } = await requireActiveContext();
  const roleErr = requireAdminRole(role);
  if (roleErr) return { error: roleErr };

  const clean = [
    ...new Set(
      units
        .map((u) => u.trim().toUpperCase())
        .filter((u) => /^[A-Z0-9./-]{1,12}$/.test(u)),
    ),
  ].slice(0, 30);

  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_tenants")
    .update({ custom_units: clean })
    .eq("id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/items");
  return { ok: true };
}

// ---- Reminder rules CRUD -------------------------------------------------------
export async function addReminderRuleAction(offsetDays: number): Promise<ActionResult> {
  if (!Number.isInteger(offsetDays) || Math.abs(offsetDays) > 90) {
    return { error: "Offset -90 se +90 din ke beech ho." };
  }
  const { tenantId, role } = await requireActiveContext();
  const roleErr = requireAdminRole(role);
  if (roleErr) return { error: roleErr };

  const supabase = await createClient();
  const { error } = await supabase.from("aimunim_reminder_rules").insert({
    tenant_id: tenantId,
    offset_days: offsetDays,
  });
  if (error) {
    return { error: error.code === "23505" ? "Ye rule pehle se hai." : error.message };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function toggleReminderRuleAction(input: {
  id: string;
  enabled: boolean;
}): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_reminder_rules")
    .update({ enabled: input.enabled })
    .eq("tenant_id", tenantId)
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteReminderRuleAction(id: string): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_reminder_rules")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
