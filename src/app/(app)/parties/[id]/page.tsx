import Link from "next/link";
import { notFound } from "next/navigation";
import { getPartyLedger } from "@/server/queries/payments";
import { formatINR } from "@/lib/money";
import { STATE_CODE_TO_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Party ledger · GST Billing" };

function balanceText(paise: number) {
  if (paise === 0) return "Settled";
  if (paise > 0) return `${formatINR(paise)} receivable`;
  return `${formatINR(-paise)} payable`;
}

export default async function PartyLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPartyLedger(id);
  if (!data) notFound();
  const { party, entries } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/parties">← All parties</Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/payments/new?party=${id}`}>Record payment</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/invoices/new">New invoice</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Party</p>
            <p className="text-lg font-semibold">{party.name}</p>
            <p className="text-sm capitalize text-muted-foreground">{party.type}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">GSTIN / State</p>
            <p className="font-medium">{party.gstin ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              {party.state_code ? STATE_CODE_TO_NAME[party.state_code] ?? party.state_code : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Outstanding</p>
            <p className="text-lg font-semibold">{balanceText(party.balance_paise)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell />
                <TableCell className="font-medium">Opening balance</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {formatINR(party.opening_balance_paise)}
                </TableCell>
              </TableRow>
              {entries.map((e) => (
                <TableRow key={`${e.kind}-${e.id}`}>
                  <TableCell className="text-muted-foreground">{e.date}</TableCell>
                  <TableCell>{e.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.debitPaise ? formatINR(e.debitPaise) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.creditPaise ? formatINR(e.creditPaise) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(e.runningPaise)}
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
