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

export const metadata = { title: "Super Admin · AI Munim" };
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
    admin.from("aimunim_tenants").select("id, name, gstin, state, plan, created_at").order("created_at", { ascending: false }),
    admin.from("aimunim_subscriptions").select("tenant_id, status, trial_ends_at, current_period_end"),
    admin.from("aimunim_invoices").select("tenant_id, total_paise").eq("direction", "sale").neq("status", "draft"),
  ]);

  const subByTenant = new Map((subs ?? []).map((s) => [s.tenant_id, s]));
  const salesByTenant = new Map<string, number>();
  for (const i of invoiceCounts ?? []) {
    salesByTenant.set(i.tenant_id, (salesByTenant.get(i.tenant_id) ?? 0) + i.total_paise);
  }

  const totalSalesPaise = [...salesByTenant.values()].reduce((s, v) => s + v, 0);
  const activeSubs = (subs ?? []).filter(
    (s) => s.status === "active" || s.status === "trialing",
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-card to-card px-5 py-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ai-munim.svg" alt="AI Munim" className="size-10 rounded-xl" />
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              Super Admin
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                Platform
              </span>
            </h1>
            <p className="text-sm text-muted-foreground">
              AI Munim — saare tenants ka internal control panel
            </p>
          </div>
        </div>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Back to app
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total tenants
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{tenants?.length ?? 0}</p>
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
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatINR(totalSalesPaise)}</p>
        </div>
      </div>
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
