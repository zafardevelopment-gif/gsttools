import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DeletePaymentButton } from "./delete-payment-button";
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
import { listPayments } from "@/server/queries/payments";
import { formatINR } from "@/lib/money";

export const metadata = { title: "Payments · GST Billing" };

export default async function PaymentsPage() {
  const payments = await listPayments();
  return (
    <div>
      <PageHeader
        title="Payments"
        description="Money received and paid out."
        action={
          <Button asChild>
            <Link href="/payments/new">
              <Plus className="size-4" /> Record payment
            </Link>
          </Button>
        }
      />
      {payments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No payments recorded yet.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{p.payment_date}</TableCell>
                  <TableCell>{p.party_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.invoice_number ?? "On account"}
                  </TableCell>
                  <TableCell className="capitalize">{p.mode}</TableCell>
                  <TableCell>
                    <Badge variant={p.direction === "in" ? "default" : "secondary"}>
                      {p.direction === "in" ? "In" : "Out"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(p.amount_paise)}
                  </TableCell>
                  <TableCell>
                    <DeletePaymentButton id={p.id} />
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
