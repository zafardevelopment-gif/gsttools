"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createPaymentAction,
  createAllocatedPaymentAction,
} from "@/server/actions/payments";
import { PAYMENT_MODES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PartyOption = { id: string; name: string };
export type UnpaidInvoice = {
  id: string;
  number: string;
  date: string;
  direction: "sale" | "purchase";
  partyId: string;
  dueRupees: number;
};

export function PaymentForm({
  parties,
  prefill,
  unpaidInvoices = [],
}: {
  parties: PartyOption[];
  prefill?: {
    direction?: "in" | "out";
    partyId?: string;
    invoiceId?: string;
    invoiceLabel?: string;
    amount?: number;
    lockParty?: boolean;
  };
  unpaidInvoices?: UnpaidInvoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [direction, setDirection] = useState<"in" | "out">(prefill?.direction ?? "in");
  const [partyId, setPartyId] = useState(prefill?.partyId ?? "");
  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount) : "");
  const [mode, setMode] = useState<(typeof PAYMENT_MODES)[number]>("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Party ke unpaid bills, direction ke hisaab se (in = sale, out = purchase).
  const partyInvoices = unpaidInvoices.filter(
    (i) =>
      i.partyId === partyId &&
      i.direction === (direction === "in" ? "sale" : "purchase"),
  );
  const showAllocation = !prefill?.invoiceId && partyInvoices.length > 0;

  // FIFO allocation of the entered amount across the selected invoices.
  const allocations: { invoiceId: string; number: string; amount: number }[] = [];
  {
    let remaining = Number(amount) || 0;
    for (const inv of partyInvoices) {
      if (!selected.has(inv.id) || remaining <= 0) continue;
      const alloc = Math.min(remaining, inv.dueRupees);
      allocations.push({ invoiceId: inv.id, number: inv.number, amount: alloc });
      remaining -= alloc;
    }
  }
  const allocatedTotal = allocations.reduce((s, a) => s + a.amount, 0);
  const onAccount = Math.max(0, (Number(amount) || 0) - allocatedTotal);

  function toggleInvoice(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      const res =
        showAllocation && allocations.length > 0
          ? await createAllocatedPaymentAction({
              direction,
              partyId,
              amount: Number(amount) || 0,
              mode,
              paymentDate,
              reference,
              notes,
              allocations: allocations.map((a) => ({
                invoiceId: a.invoiceId,
                amount: a.amount,
              })),
            })
          : await createPaymentAction({
              direction,
              partyId,
              invoiceId: prefill?.invoiceId ?? null,
              amount: Number(amount) || 0,
              mode,
              paymentDate,
              reference,
              notes,
            });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Payment recorded.");
        router.push(prefill?.invoiceId ? `/invoices/${prefill.invoiceId}` : "/payments");
        router.refresh();
      }
    });
  }

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-4 pt-6">
        {prefill?.invoiceLabel && (
          <p className="rounded-md bg-muted p-2 text-sm">
            Allocating to invoice <span className="font-medium">{prefill.invoiceLabel}</span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "in" | "out")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Payment in (received)</SelectItem>
                <SelectItem value="out">Payment out (paid)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Party</Label>
            <Select value={partyId} onValueChange={setPartyId} disabled={prefill?.lockParty}>
              <SelectTrigger><SelectValue placeholder="Select party" /></SelectTrigger>
              <SelectContent>
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input id="amount" type="number" step="0.01" min="0" value={amount}
              onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference</Label>
            <Input id="reference" value={reference} placeholder="UPI ref / cheque no."
              onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>

        {showAllocation && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">
              Unpaid invoices — allocate karne ke liye select karein (FIFO)
            </p>
            <div className="max-h-44 space-y-1.5 overflow-y-auto">
              {partyInvoices.map((inv) => {
                const alloc = allocations.find((a) => a.invoiceId === inv.id);
                return (
                  <label
                    key={inv.id}
                    className="flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selected.has(inv.id)}
                      onChange={(e) => toggleInvoice(inv.id, e.target.checked)}
                    />
                    <span className="font-medium">{inv.number}</span>
                    <span className="text-xs text-muted-foreground">{inv.date}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      Due ₹{inv.dueRupees.toLocaleString("en-IN")}
                    </span>
                    {alloc && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                        → ₹{alloc.amount.toLocaleString("en-IN")}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            {selected.size > 0 && (
              <p className="text-xs text-muted-foreground">
                Allocated: ₹{allocatedTotal.toLocaleString("en-IN")}
                {onAccount > 0
                  ? ` · Baaki ₹${onAccount.toLocaleString("en-IN")} on-account jayega`
                  : ""}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <Button onClick={submit} disabled={pending || !partyId}>
          {pending ? "Saving…" : "Record payment"}
        </Button>
      </CardContent>
    </Card>
  );
}
