"use client";

import { refreshWithRetry } from "@/lib/refresh-with-retry";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  createRecurringAction,
  toggleRecurringAction,
  deleteRecurringAction,
} from "@/server/actions/recurring";
import { formatINR } from "@/lib/money";
import type { RecurringInvoiceRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PartyOption = { id: string; name: string };
export type ItemOption = { id: string; name: string; sale_price_paise: number; unit: string };

type Line = { key: number; itemId: string; qty: string };
let seq = 1;

export function NewRecurringDialog({
  parties,
  items,
}: {
  parties: PartyOption[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [partyId, setPartyId] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [autoShare, setAutoShare] = useState(true);
  const [lines, setLines] = useState<Line[]>([{ key: seq++, itemId: "", qty: "1" }]);

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const validLines = lines.filter((l) => l.itemId && Number(l.qty) > 0);
    if (!partyId) return void toast.error("Party select karen.");
    if (!validLines.length) return void toast.error("Kam se kam ek item add karen.");

    startTransition(async () => {
      const res = await createRecurringAction({
        name: String(fd.get("name") ?? ""),
        partyId,
        frequency,
        nextRunDate: String(fd.get("next_run") ?? ""),
        autoShare,
        lines: validLines.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Automated bill created.");
        setOpen(false);
        setLines([{ key: seq++, itemId: "", qty: "1" }]);
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New automated bill
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New automated bill</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rc_name">Name</Label>
            <Input id="rc_name" name="name" placeholder="Monthly AMC bill" required />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Party</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as typeof frequency)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc_next">First run</Label>
              <Input
                id="rc_next"
                name="next_run"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            {lines.map((l) => (
              <div key={l.key} className="flex gap-2">
                <Select value={l.itemId} onValueChange={(v) => updateLine(l.key, { itemId: v })}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Item" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {items.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name} ({formatINR(i.sale_price_paise)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="w-20"
                  type="number"
                  step="0.001"
                  min="0"
                  value={l.qty}
                  onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setLines((prev) =>
                      prev.length > 1 ? prev.filter((x) => x.key !== l.key) : prev,
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((prev) => [...prev, { key: seq++, itemId: "", qty: "1" }])}
            >
              <Plus className="size-3.5" /> Add item
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={autoShare}
              onChange={(e) => setAutoShare(e.target.checked)}
            />
            Invoice bante hi WhatsApp par auto-send karen
          </label>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecurringList({
  bills,
  partyNames,
}: {
  bills: RecurringInvoiceRow[];
  partyNames: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(id: string, isActive: boolean) {
    startTransition(async () => {
      const res = await toggleRecurringAction({ id, isActive });
      if (res.error) toast.error(res.error);
      else refreshWithRetry(router);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteRecurringAction(id);
      if (res.error) toast.error(res.error);
      else refreshWithRetry(router);
    });
  }

  if (bills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No automated bills yet. Schedule your first recurring invoice.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {bills.map((b) => {
        const itemCount = Array.isArray(b.items) ? b.items.length : 0;
        return (
          <Card key={b.id}>
            <CardContent className="flex flex-col gap-2 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {partyNames[b.party_id] ?? "—"} · {itemCount} item(s)
                  </p>
                </div>
                <Badge variant={b.is_active ? "default" : "secondary"} className="capitalize">
                  {b.is_active ? b.frequency : "Paused"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Next run: <span className="font-medium text-foreground">{b.next_run_date}</span>
                {b.last_run_at ? ` · Last: ${b.last_run_at.slice(0, 10)}` : ""}
                {b.auto_share ? " · auto-share on" : ""}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => toggle(b.id, !b.is_active)}
                >
                  {b.is_active ? "Pause" : "Resume"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => remove(b.id)}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
