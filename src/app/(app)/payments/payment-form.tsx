"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPaymentAction } from "@/server/actions/payments";
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

export function PaymentForm({
  parties,
  prefill,
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

  function submit() {
    startTransition(async () => {
      const res = await createPaymentAction({
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
