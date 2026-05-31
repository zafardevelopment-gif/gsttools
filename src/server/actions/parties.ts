"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { partyFormSchema } from "@/lib/validation/party";
import { stateCodeFromGstin } from "@/lib/validation/common";
import { rupeesToPaise } from "@/lib/money";

export type ActionResult = { ok?: true; error?: string };

function parseParty(formData: FormData) {
  return partyFormSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    gstin: formData.get("gstin") ?? "",
    state_code: formData.get("state_code") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    billing_address: formData.get("billing_address") ?? undefined,
    shipping_address: formData.get("shipping_address") ?? undefined,
    opening_balance: formData.get("opening_balance") ?? 0,
  });
}

export async function createPartyAction(formData: FormData): Promise<ActionResult> {
  const parsed = parseParty(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const stateCode = v.state_code ?? stateCodeFromGstin(v.gstin) ?? null;
  const openingPaise = rupeesToPaise(v.opening_balance);

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const { error } = await supabase.from("GST_parties").insert({
    tenant_id: tenantId,
    type: v.type,
    name: v.name,
    gstin: v.gstin || null,
    state_code: stateCode,
    phone: v.phone || null,
    email: v.email || null,
    billing_address: v.billing_address || null,
    shipping_address: v.shipping_address || null,
    opening_balance_paise: openingPaise,
    balance_paise: openingPaise, // no transactions yet
  });

  if (error) return { error: error.message };
  revalidatePath("/parties");
  return { ok: true };
}

export async function updatePartyAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseParty(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const stateCode = v.state_code ?? stateCodeFromGstin(v.gstin) ?? null;
  const newOpening = rupeesToPaise(v.opening_balance);

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  // Adjust live balance by the change in opening balance so it stays correct.
  const { data: existing } = await supabase
    .from("GST_parties")
    .select("opening_balance_paise, balance_paise")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  const delta = newOpening - (existing?.opening_balance_paise ?? 0);
  const newBalance = (existing?.balance_paise ?? 0) + delta;

  const { error } = await supabase
    .from("GST_parties")
    .update({
      type: v.type,
      name: v.name,
      gstin: v.gstin || null,
      state_code: stateCode,
      phone: v.phone || null,
      email: v.email || null,
      billing_address: v.billing_address || null,
      shipping_address: v.shipping_address || null,
      opening_balance_paise: newOpening,
      balance_paise: newBalance,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };
  revalidatePath("/parties");
  return { ok: true };
}

export async function deletePartyAction(id: string): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("GST_parties")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  // FK restrict on invoices/payments will block deletion of parties in use.
  if (error)
    return {
      error: error.message.includes("violates foreign key")
        ? "This party has invoices/payments and can't be deleted."
        : error.message,
    };
  revalidatePath("/parties");
  return { ok: true };
}
