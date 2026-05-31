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
import { Plus } from "lucide-react";

export const metadata = { title: "Invoices · GST Billing" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  paid: "default",
  partial: "secondary",
  unpaid: "destructive",
  draft: "secondary",
};

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Sales invoices and purchase bills."
        action={
          <Button asChild>
            <Link href="/invoices/new">
              <Plus className="size-4" /> New invoice
            </Link>
          </Button>
        }
      />
      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No invoices yet. Create your first one.
        </div>
      ) : (
        <div className="rounded-lg border">
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
                  <TableCell className="capitalize text-muted-foreground">
                    {inv.direction}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(inv.total_paise)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[inv.status] ?? "secondary"} className="capitalize">
                      {inv.status}
                    </Badge>
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
