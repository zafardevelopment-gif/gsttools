import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

/**
 * Append one row to the tenant's activity trail (aimunim_audit_logs).
 * Fire-and-forget: auditing must never break the action being audited.
 */
export function logAudit(entry: {
  tenantId: string;
  userId?: string | null;
  action: string; // e.g. "invoice.created"
  entityType?: string;
  entityId?: string | null;
  data?: Json;
}): void {
  const admin = createAdminClient();
  void admin
    .from("aimunim_audit_logs")
    .insert({
      tenant_id: entry.tenantId,
      user_id: entry.userId ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      data: entry.data ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[audit] insert failed:", error.message);
    });
}
