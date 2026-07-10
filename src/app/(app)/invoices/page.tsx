import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listInvoices } from "@/server/queries/invoices";
import { formatINR } from "@/lib/money";
import { VOUCHER_TYPES, type VoucherTypeKey } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

export const metadata = { title: "Invoices · GST Billing" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  paid: "default",
  partial: "secondary",
  unpaid: "destructive",
  draft: "secondary",
};

/** Tabs across the top of the list — "all" plus every voucher type. */
const TABS: { key: "all" | VoucherTypeKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "invoice", label: "Invoices" },
  { key: "quotation", label: "Quotations" },
  { key: "proforma", label: "Proforma" },
  { key: "delivery_challan", label: "Challans" },
  { key: "sales_return", label: "Sales Returns" },
  { key: "credit_note", label: "Credit Notes" },
  { key: "purchase_order", label: "POs" },
  { key: "purchase_return", label: "Purchase Returns" },
  { key: "debit_note", label: "Debit Notes" },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const active: "all" | VoucherTypeKey =
    type && type in VOUCHER_TYPES ? (type as VoucherTypeKey) : "all";

  const invoices = await listInvoices(
    active === "all" ? undefined : { voucherType: active },
  );

  const newHref =
    active === "all" || active === "invoice"
      ? "/invoices/new"
      : `/invoices/new?type=${active}`;

  return (
    <div>
      <PageHeader
        title="Sales & Purchases"
        description="Invoices, quotations, returns, notes, challans and POs."
        action={
          <Button asChild>
            <Link href={newHref}>
              <Plus className="size-4" /> New{" "}
              {active === "all" ? "invoice" : VOUCHER_TYPES[active].shortLabel.toLowerCase()}
            </Link>
          </Button>
        }
      />

      {/* Voucher-type tabs — horizontally scrollable on mobile. */}
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/invoices" : `/invoices?type=${t.key}`}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Nothing here yet. Create your first one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                      {inv.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{inv.invoice_date}</TableCell>
                  <TableCell>{inv.party_name ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {VOUCHER_TYPES[inv.voucher_type]?.shortLabel ?? inv.voucher_type}
                    {inv.voucher_type === "invoice" && inv.direction === "purchase"
                      ? " (Purchase)"
                      : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(inv.total_paise)}
                  </TableCell>
                  <TableCell>
                    {VOUCHER_TYPES[inv.voucher_type]?.ledger === 0 ? (
                      <Badge variant="secondary">Open</Badge>
                    ) : (
                      <Badge
                        variant={STATUS_VARIANT[inv.status] ?? "secondary"}
                        className="capitalize"
                      >
                        {inv.status}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
