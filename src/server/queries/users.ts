import "server-only";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import type { AuditLogRow, MembershipRow } from "@/lib/database.types";

export type MemberRow = MembershipRow & { email: string | null };

export async function listMembers(): Promise<MemberRow[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("aimunim_memberships")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (!memberships?.length) return [];

  // Emails live in auth.users — resolve via the service-role auth API.
  const admin = createAdminClient();
  const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((page?.users ?? []).map((u) => [u.id, u.email ?? null]));

  return memberships.map((m) => ({ ...m, email: emailById.get(m.user_id) ?? null }));
}

export type ActivityRow = AuditLogRow & { user_email: string | null };

export async function listActivity(limit = 50): Promise<ActivityRow[]> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("aimunim_audit_logs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!logs?.length) return [];

  const admin = createAdminClient();
  const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((page?.users ?? []).map((u) => [u.id, u.email ?? null]));

  return logs.map((l) => ({
    ...l,
    user_email: l.user_id ? (emailById.get(l.user_id) ?? null) : null,
  }));
}
