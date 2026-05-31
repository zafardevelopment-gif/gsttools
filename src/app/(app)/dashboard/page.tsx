import Link from "next/link";
import { getDashboardStats } from "@/server/queries/reports";
import { getAppContext } from "@/server/queries/app-context";
import { formatINR } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Dashboard · GST Billing" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const [stats, ctx] = await Promise.all([getDashboardStats(), getAppContext()]);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${ctx.activeTenant.name}`}
        description="Your business at a glance (this month)."
        action={
          <Button asChild>
            <Link href="/invoices/new">+ New invoice</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today's sales" value={formatINR(stats.todaySalesPaise)} />
        <Stat label="This month sales" value={formatINR(stats.monthSalesPaise)} />
        <Stat label="Today's collection" value={formatINR(stats.todayCollectionPaise)} />
        <Stat label="Stock value" value={formatINR(stats.stockValuePaise)} />
        <Stat label="Receivables" value={formatINR(stats.receivablesPaise)} sub="Money owed to you" />
        <Stat label="Payables" value={formatINR(stats.payablesPaise)} sub="You owe suppliers" />
        <Stat label="This month expenses" value={formatINR(stats.monthExpensesPaise)} />
        <Stat
          label="Low-stock items"
          value={String(stats.lowStock.length)}
          sub={stats.lowStock.length ? "Needs reordering" : "All good"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Recent invoices</h2>
              <Link href="/invoices" className="text-sm text-muted-foreground hover:underline">
                View all
              </Link>
            </div>
            {stats.recentInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <ul className="divide-y">
                {stats.recentInvoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                      {inv.invoice_number}
                    </Link>
                    <span className="text-muted-foreground">{inv.invoice_date}</span>
                    <span className="tabular-nums">{formatINR(inv.total_paise)}</span>
                    <Badge variant="secondary" className="capitalize">{inv.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Low stock</h2>
              <Link href="/items" className="text-sm text-muted-foreground hover:underline">
                Manage items
              </Link>
            </div>
            {stats.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">No low-stock items.</p>
            ) : (
              <ul className="divide-y">
                {stats.lowStock.map((it) => (
                  <li key={it.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{it.name}</span>
                    <Badge variant="destructive">
                      {it.stock_qty} {it.unit}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
