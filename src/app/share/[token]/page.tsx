import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { VOUCHER_TYPES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Shared Ledger" };
export const dynamic = "force-dynamic";

/**
 * Public shared-ledger portal (spec: Parties → Shared Ledger).
 * The unguessable share_token is the only credential — the page shows just
 * that one party's statement, read-only, via the service-role client.
 */
export default async function SharedLedgerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const admin = createAdminClient();
  const { data: party } = await admin
    .from("aimunim_parties")
    .select("id, tenant_id, name, phone, balance_paise")
    .eq("share_token", token)
    .maybeSingle();
  if (!party) notFound();

  const [{ data: tenant }, { data: invoices }, { data: payments }] = await Promise.all([
    admin
      .from("aimunim_tenants")
      .select("name, phone, city, state")
      .eq("id", party.tenant_id)
      .single(),
    admin
      .from("aimunim_invoices")
      .select("invoice_number, invoice_date, direction, voucher_type, total_paise, status")
      .eq("party_id", party.id)
      .neq("status", "draft")
      .order("invoice_date", { ascending: false })
      .limit(100),
    admin
      .from("aimunim_payments")
      .select("payment_date, direction, mode, amount_paise, reference")
      .eq("party_id", party.id)
      .order("payment_date", { ascending: false })
      .limit(100),
  ]);

  type Entry = {
    date: string;
    kind: string;
    ref: string;
    debit: number; // increases what the party owes
    credit: number; // reduces it
  };
  const entries: Entry[] = [];
  for (const i of invoices ?? []) {
    const meta = VOUCHER_TYPES[i.voucher_type];
    if (!meta || meta.ledger === 0) continue;
    const isDebit = i.direction === "sale" && i.voucher_type === "invoice";
    entries.push({
      date: i.invoice_date,
      kind: meta.shortLabel,
      ref: i.invoice_number,
      debit: isDebit ? i.total_paise : 0,
      credit: isDebit ? 0 : i.total_paise,
    });
  }
  for (const p of payments ?? []) {
    entries.push({
      date: p.payment_date,
      kind: p.direction === "in" ? "Payment received" : "Payment made",
      ref: p.reference ?? p.mode.toUpperCase(),
      debit: p.direction === "out" ? p.amount_paise : 0,
      credit: p.direction === "in" ? p.amount_paise : 0,
    });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 rounded-lg border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Statement from
        </p>
        <h1 className="text-xl font-bold">{tenant?.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[tenant?.city, tenant?.state].filter(Boolean).join(", ")}
          {tenant?.phone ? ` · ${tenant.phone}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Account of
            </p>
            <p className="font-semibold">{party.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {party.balance_paise >= 0 ? "Amount payable" : "Advance / credit"}
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {formatINR(Math.abs(party.balance_paise))}
            </p>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No transactions yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {e.date}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{e.kind}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.ref}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.debit ? formatINR(e.debit) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.credit ? formatINR(e.credit) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Read-only statement · Generated by {tenant?.name} via AI Munim
      </p>
    </main>
  );
}
