import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Super Admin · GST Billing" };
export const dynamic = "force-dynamic";

/**
 * Internal super-admin view of all tenants. Uses the service-role client to
 * bypass RLS, gated by the SUPERADMIN_EMAILS allow-list. NOT under the (app)
 * shell because a super admin may not belong to any tenant.
 */
export default async function AdminPage() {
  const user = await requireUser();
  if (!isSuperAdmin(user.email)) notFound();

  const admin = createAdminClient();
  const [{ data: tenants }, { data: subs }, { data: invoiceCounts }] = await Promise.all([
    admin.from("GST_tenants").select("id, name, gstin, state, plan, created_at").order("created_at", { ascending: false }),
    admin.from("GST_subscriptions").select("tenant_id, status, trial_ends_at, current_period_end"),
    admin.from("GST_invoices").select("tenant_id, total_paise").eq("direction", "sale").neq("status", "draft"),
  ]);

  const subByTenant = new Map((subs ?? []).map((s) => [s.tenant_id, s]));
  const salesByTenant = new Map<string, number>();
  for (const i of invoiceCounts ?? []) {
    salesByTenant.set(i.tenant_id, (salesByTenant.get(i.tenant_id) ?? 0) + i.total_paise);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Super Admin</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Back to app
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {tenants?.length ?? 0} tenant(s).
      </p>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Lifetime sales</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tenants ?? []).map((t) => {
              const sub = subByTenant.get(t.id);
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.gstin ?? "—"}</TableCell>
                  <TableCell className="capitalize">{t.plan}</TableCell>
                  <TableCell>
                    <Badge variant={sub?.status === "active" ? "default" : "secondary"}>
                      {sub?.status ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(salesByTenant.get(t.id) ?? 0)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.created_at.slice(0, 10)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
