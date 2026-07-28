import "server-only";
import { partyFormSchema, type PartyFormInput, type PartyFormValues } from "@/lib/validation/party";
import { stateCodeFromGstin } from "@/lib/validation/common";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/server/audit";
import { emitEvent } from "@/server/automation/events";
import type { DbClient } from "@/server/services/invoices";

/**
 * Party creation service — shared by the UI action and the ingest API, so a
 * customer created by an n8n lead-capture workflow is identical to one typed
 * into the Parties screen (same validation, same opening-balance handling,
 * same GSTIN → state derivation).
 */

export type CreatePartyResult = { id?: string; error?: string };

/** Column payload for the (0007) extended party fields. */
export function extraPartyColumns(v: PartyFormValues) {
  return {
    pan: v.pan || null,
    category: v.category || null,
    pricing_tier: v.pricing_tier,
    contact_person: v.contact_person || null,
    credit_period_days: Math.round(v.credit_period_days),
    credit_limit_paise: rupeesToPaise(v.credit_limit),
  };
}

export async function createParty(params: {
  db: DbClient;
  tenantId: string;
  userId?: string | null;
  input: PartyFormInput;
  source?: string;
}): Promise<CreatePartyResult> {
  const parsed = partyFormSchema.safeParse(params.input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid party." };
  }
  const v = parsed.data;

  const stateCode = v.state_code ?? stateCodeFromGstin(v.gstin) ?? null;
  const openingPaise = rupeesToPaise(v.opening_balance);

  const { data, error } = await params.db
    .from("aimunim_parties")
    .insert({
      tenant_id: params.tenantId,
      type: v.type,
      name: v.name,
      gstin: v.gstin || null,
      state_code: stateCode,
      phone: v.phone || null,
      email: v.email || null,
      billing_address: v.billing_address || null,
      shipping_address: v.shipping_address || null,
      opening_balance_paise: openingPaise,
      // No transactions yet, so the live balance starts at the opening balance.
      balance_paise: openingPaise,
      ...extraPartyColumns(v),
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create party." };

  logAudit({
    tenantId: params.tenantId,
    userId: params.userId ?? null,
    action: "party.created",
    entityType: "party",
    entityId: data.id,
    data: { name: v.name, source: params.source ?? "ui" },
  });

  emitEvent({
    tenantId: params.tenantId,
    type: "party.created",
    entityType: "party",
    entityId: data.id,
    payload: {
      party_id: data.id,
      name: v.name,
      type: v.type,
      phone: v.phone || null,
      email: v.email || null,
      gstin: v.gstin || null,
      source: params.source ?? "ui",
    },
  });

  return { id: data.id };
}
