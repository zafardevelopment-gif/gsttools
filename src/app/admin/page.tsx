import { createAdminClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TenantRowActions } from "@/components/admin/tenant-row-actions";
import type { DbPlanKey, DbStatusKey } from "@/server/actions/super-admin";

export const dynamic = "force-dynamic";

/**
 * Platform overview: every tenant, their plan/subscription status and
 * lifetime sales, with inline actions to change plan, suspend/reactivate
 * (via subscription status) or open a tenant's dashboard ("View as").
 * Auth is enforced by src/app/admin/layout.tsx (isSuperAdmin gate), which
 * wraps every /admin/* route — this page just renders the data.
 */
export default async function AdminPage() {
  const admin = createAdminClient();
  const [{ data: tenants }, { data: subs }, { data: invoiceCounts }] =
    await Promise.all([
      admin
        .from("aimunim_tenants")
        .select("id, name, gstin, state, plan, created_at")
        .order("created_at", { ascending: false }),
      admin
        .from("aimunim_subscriptions")
        .select("tenant_id, status, trial_ends_at, current_period_end"),
      admin
        .from("aimunim_invoices")
        .select("tenant_id, total_paise")
        .eq("direction", "sale")
        .neq("status", "draft"),
    ]);

  const subByTenant = new Map((subs ?? []).map((s) => [s.tenant_id, s]));
  const salesByTenant = new Map<string, number>();
  for (const i of invoiceCounts ?? []) {
    salesByTenant.set(
      i.tenant_id,
      (salesByTenant.get(i.tenant_id) ?? 0) + i.total_paise,
    );
  }

  const totalSalesPaise = [...salesByTenant.values()].reduce(
    (s, v) => s + v,
    0,
  );
  const activeSubs = (subs ?? []).filter(
    (s) => s.status === "active" || s.status === "trialing",
  ).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every business on AI Munim — change plans, suspend access, or open
          a tenant's dashboard directly.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total tenants
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {tenants?.length ?? 0}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Active / trialing subs
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{activeSubs}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Platform lifetime sales
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {formatINR(totalSalesPaise)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead className="text-right">Lifetime sales</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Plan &amp; status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tenants ?? []).map((t) => {
              const sub = subByTenant.get(t.id);
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.gstin ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(salesByTenant.get(t.id) ?? 0)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.created_at.slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <TenantRowActions
                      tenantId={t.id}
                      plan={t.plan as DbPlanKey}
                      status={(sub?.status as DbStatusKey) ?? null}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {(tenants ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No tenants yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
