"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { generateApiKey } from "@/server/automation/auth";
import { generateWebhookSecret } from "@/server/automation/dispatch";
import { emitEvent } from "@/server/automation/events";
import { logAudit } from "@/server/audit";

export type ActionResult = { ok?: true; error?: string };

/**
 * API key management for the Automation section.
 *
 * Only owners and admins can reach these: the RLS policy in migration 0013
 * uses has_tenant_role(tenant_id, ['owner','admin']), so a salesman's session
 * simply cannot insert here even if they call the action directly. The role
 * check below is the friendly error, not the security boundary.
 */

const MANAGER_ROLES = ["owner", "admin"];

export type CreateKeyResult = ActionResult & {
  /** Plaintext key — returned exactly once, never stored, never logged. */
  key?: string;
};

export async function createApiKeyAction(label: string): Promise<CreateKeyResult> {
  const trimmed = label.trim();
  if (!trimmed) return { error: "Key ka naam likhein (jaise: n8n production)." };

  const { tenantId, userId, role } = await requireActiveContext();
  if (!MANAGER_ROLES.includes(role)) {
    return { error: "Sirf owner ya admin API key bana sakte hain." };
  }

  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("aimunim_tenants")
    .select("automation_enabled")
    .eq("id", tenantId)
    .single();
  if (!tenant?.automation_enabled) {
    return { error: "Pehle Automation on karein, phir key banayein." };
  }

  const { key, keyHash, keyPrefix } = generateApiKey();

  const { data, error } = await supabase
    .from("aimunim_automation_api_keys")
    .insert({
      tenant_id: tenantId,
      label: trimmed,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      scopes: ["read", "write"],
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Key ban nahi payi." };

  // Log the event, never the secret — only the non-sensitive prefix.
  logAudit({
    tenantId,
    userId,
    action: "automation.key_created",
    entityType: "automation_api_key",
    entityId: data.id,
    data: { label: trimmed, key_prefix: keyPrefix },
  });

  revalidatePath("/automation");
  return { ok: true, key };
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  const { tenantId, userId, role } = await requireActiveContext();
  if (!MANAGER_ROLES.includes(role)) {
    return { error: "Sirf owner ya admin key revoke kar sakte hain." };
  }

  const supabase = await createClient();
  // Revoked, not deleted: the ingest log references this key, and the history
  // of "which key did what" is worth more than a tidy table.
  const { error } = await supabase
    .from("aimunim_automation_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .is("revoked_at", null);

  if (error) return { error: error.message };

  logAudit({
    tenantId,
    userId,
    action: "automation.key_revoked",
    entityType: "automation_api_key",
    entityId: id,
  });

  revalidatePath("/automation");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Webhooks (outbound)
// ---------------------------------------------------------------------------

export async function createWebhookAction(input: {
  label: string;
  url: string;
  events: string[];
}): Promise<ActionResult> {
  const label = input.label.trim() || "n8n";
  const url = input.url.trim();

  // Reject anything that isn't a real https endpoint before it can ever be
  // signed and posted to. http:// would leak the payload in transit.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "URL sahi nahi hai. Poora URL daalein, jaise https://…" };
  }
  if (parsed.protocol !== "https:") {
    return { error: "Sirf https URL chalega — http pe data khula jaata hai." };
  }

  const { tenantId, userId, role } = await requireActiveContext();
  if (!MANAGER_ROLES.includes(role)) {
    return { error: "Sirf owner ya admin webhook add kar sakte hain." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("aimunim_automation_webhooks")
    .insert({
      tenant_id: tenantId,
      label,
      target_url: url,
      secret: generateWebhookSecret(),
      // Empty array = subscribe to everything.
      events: input.events ?? [],
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Webhook add nahi hua." };

  logAudit({
    tenantId,
    userId,
    action: "automation.webhook_created",
    entityType: "automation_webhook",
    entityId: data.id,
    data: { label, host: parsed.host },
  });

  revalidatePath("/automation");
  return { ok: true };
}

export async function deleteWebhookAction(id: string): Promise<ActionResult> {
  const { tenantId, userId, role } = await requireActiveContext();
  if (!MANAGER_ROLES.includes(role)) {
    return { error: "Sirf owner ya admin webhook hata sakte hain." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_automation_webhooks")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  logAudit({
    tenantId,
    userId,
    action: "automation.webhook_deleted",
    entityType: "automation_webhook",
    entityId: id,
  });

  revalidatePath("/automation");
  return { ok: true };
}

/** Re-enable an endpoint that was auto-disabled after repeated failures. */
export async function reactivateWebhookAction(id: string): Promise<ActionResult> {
  const { tenantId, role } = await requireActiveContext();
  if (!MANAGER_ROLES.includes(role)) {
    return { error: "Sirf owner ya admin ye kar sakte hain." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_automation_webhooks")
    .update({ is_active: true, consecutive_failures: 0 })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };
  revalidatePath("/automation");
  return { ok: true };
}

/**
 * Fire a test event at one endpoint so the user can confirm their n8n workflow
 * receives and verifies it — without having to create a real invoice first.
 */
export async function sendTestEventAction(webhookId: string): Promise<ActionResult> {
  const { tenantId, role } = await requireActiveContext();
  if (!MANAGER_ROLES.includes(role)) {
    return { error: "Sirf owner ya admin test bhej sakte hain." };
  }

  const supabase = await createClient();
  const { data: hook } = await supabase
    .from("aimunim_automation_webhooks")
    .select("id")
    .eq("id", webhookId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!hook) return { error: "Webhook nahi mila." };

  emitEvent({
    tenantId,
    type: "invoice.created",
    entityType: "test",
    entityId: null,
    payload: {
      test: true,
      message: "Ye AI Munim ka test event hai. Aapka endpoint sahi chal raha hai.",
      invoice_number: "TEST/0000/00000",
      total_rupees: 100,
    },
  });

  revalidatePath("/automation");
  return { ok: true };
}

/** Master switch for the whole /api/v1/ingest surface, per tenant. */
export async function setAutomationEnabledAction(
  enabled: boolean,
): Promise<ActionResult> {
  const { tenantId, userId, role } = await requireActiveContext();
  if (!MANAGER_ROLES.includes(role)) {
    return { error: "Sirf owner ya admin ye setting badal sakte hain." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_tenants")
    .update({ automation_enabled: enabled })
    .eq("id", tenantId);

  if (error) return { error: error.message };

  logAudit({
    tenantId,
    userId,
    action: enabled ? "automation.enabled" : "automation.disabled",
    entityType: "tenant",
    entityId: tenantId,
  });

  revalidatePath("/automation");
  return { ok: true };
}
