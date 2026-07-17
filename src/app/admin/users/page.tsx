import { createAdminClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  staff: "outline",
};

/**
 * Every user with at least one tenant membership, across the whole
 * platform. Emails live in Supabase auth.users (not queryable via
 * postgrest), so they're fetched separately via the admin auth API and
 * joined in memory onto aimunim_memberships rows.
 */
export default async function AdminUsersPage() {
  const admin = createAdminClient();
  const [{ data: memberships }, { data: tenants }, { data: authUsers }] =
    await Promise.all([
      admin
        .from("aimunim_memberships")
        .select("id, tenant_id, user_id, role, created_at")
        .order("created_at", { ascending: false }),
      admin.from("aimunim_tenants").select("id, name"),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);

  const tenantNameById = new Map((tenants ?? []).map((t) => [t.id, t.name]));
  const emailByUserId = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.email ?? "—"]),
  );

  const rows = (memberships ?? []).map((m) => ({
    ...m,
    email: emailByUserId.get(m.user_id) ?? "—",
    tenantName: tenantNameById.get(m.tenant_id) ?? "—",
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every user with access to a business on AI Munim, across all
          tenants.
        </p>
      </div>

      <div className="mb-6 rounded-xl border bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Total memberships
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{rows.length}</p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.email}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.tenantName}
                </TableCell>
                <TableCell>
                  <Badge variant={ROLE_VARIANT[r.role] ?? "outline"}>
                    {r.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.created_at.slice(0, 10)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-muted-foreground"
                >
                  No users yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
