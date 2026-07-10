import Link from "next/link";
import {
  TrendingUp,
  CalendarDays,
  Wallet,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  Receipt,
  PackageSearch,
  type LucideIcon,
} from "lucide-react";
import { getDashboardStats } from "@/server/queries/reports";
import { getAppContext } from "@/server/queries/app-context";
import { formatINR } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Dashboard · GST Billing" };

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  accent = "var(--color-chart-1)",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
      />
      <CardContent className="flex items-start justify-between gap-3 pt-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in oklch, ${accent} 14%, transparent)` }}
        >
          <Icon className="size-4.5" style={{ color: accent }} />
        </span>
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
        <Stat label="Today's sales" value={formatINR(stats.todaySalesPaise)} icon={TrendingUp} accent="var(--color-chart-1)" />
        <Stat label="This month sales" value={formatINR(stats.monthSalesPaise)} icon={CalendarDays} accent="var(--color-chart-1)" />
        <Stat label="Today's collection" value={formatINR(stats.todayCollectionPaise)} icon={Wallet} accent="var(--color-chart-3)" />
        <Stat label="Stock value" value={formatINR(stats.stockValuePaise)} icon={Boxes} accent="var(--color-chart-2)" />
        <Stat label="Receivables" value={formatINR(stats.receivablesPaise)} sub="Money owed to you" icon={ArrowDownToLine} accent="var(--color-chart-3)" />
        <Stat label="Payables" value={formatINR(stats.payablesPaise)} sub="You owe suppliers" icon={ArrowUpFromLine} accent="var(--color-chart-5)" />
        <Stat label="This month expenses" value={formatINR(stats.monthExpensesPaise)} icon={Receipt} accent="var(--color-chart-4)" />
        <Stat
          label="Low-stock items"
          value={String(stats.lowStock.length)}
          sub={stats.lowStock.length ? "Needs reordering" : "All good"}
          icon={PackageSearch}
          accent={stats.lowStock.length ? "var(--color-destructive)" : "var(--color-chart-3)"}
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
