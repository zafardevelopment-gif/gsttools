import { createAdminClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 200;

/**
 * Platform-wide activity feed — the most recent audit log entries across
 * every tenant, newest first. aimunim_audit_logs already has an index on
 * (tenant_id, created_at desc); this cross-tenant query relies on the
 * service-role client (RLS would otherwise scope it to one tenant).
 */
export default async function AdminActivityPage() {
  const admin = createAdminClient();
  const [{ data: logs }, { data: tenants }, { data: authUsers }] =
    await Promise.all([
      admin
        .from("aimunim_audit_logs")
        .select("id, tenant_id, user_id, action, entity_type, created_at")
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
      admin.from("aimunim_tenants").select("id, name"),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);

  const tenantNameById = new Map((tenants ?? []).map((t) => [t.id, t.name]));
  const emailByUserId = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.email ?? "—"]),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The most recent {RECENT_LIMIT} actions across every tenant on the
          platform.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(logs ?? []).map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(log.created_at).toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="font-medium">
                  {tenantNameById.get(log.tenant_id) ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {log.user_id ? (emailByUserId.get(log.user_id) ?? "—") : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {log.action}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {log.entity_type ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {(logs ?? []).length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  No activity yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
