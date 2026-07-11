import { requireRouteAccess } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCashBankSummary } from "@/server/queries/cashbank";
import { formatINR } from "@/lib/money";
import {
  AddBankAccountDialog,
  AdjustMoneyDialog,
  TransferMoneyDialog,
} from "./cashbank-dialogs";

export const metadata = { title: "Cash & Bank · AI Munim" };
export const dynamic = "force-dynamic";

export default async function CashBankPage() {
  await requireRouteAccess("/cash-bank");
  const summary = await getCashBankSummary();
  const accountOptions = summary.accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div>
      <PageHeader
        title="Cash & Bank"
        description="Cash in hand, bank accounts, transfers and adjustments."
        action={
          <div className="flex flex-wrap gap-2">
            <AdjustMoneyDialog accounts={accountOptions} />
            <TransferMoneyDialog accounts={accountOptions} />
            <AddBankAccountDialog />
          </div>
        }
      />

      {/* Balance cards — stack on mobile. */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatINR(summary.totalPaise)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cash in hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatINR(summary.cashPaise)}</p>
          </CardContent>
        </Card>
        {summary.accounts.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {a.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{formatINR(a.balance_paise)}</p>
              {a.account_number && (
                <p className="mt-1 text-xs text-muted-foreground">
                  A/c …{a.account_number.slice(-4)}
                  {a.ifsc ? ` · ${a.ifsc}` : ""}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Recent manual entries
      </h2>
      {summary.recentTxns.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No manual entries yet. Use “Add / Reduce money” or “Transfer”.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Ledger</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.recentTxns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {t.txn_date}
                  </TableCell>
                  <TableCell>{t.account_name ?? "Cash in hand"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">{t.kind}</Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      t.direction === "in" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {t.direction === "in" ? "+" : "−"}
                    {formatINR(t.amount_paise)}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {t.notes ?? "—"}
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
