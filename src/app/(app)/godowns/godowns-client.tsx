"use client";

import { refreshWithRetry } from "@/lib/refresh-with-retry";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ArrowLeftRight, PackagePlus } from "lucide-react";
import {
  createGodownAction,
  transferStockAction,
  assignStockToGodownAction,
} from "@/server/actions/godowns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export type GodownOption = { id: string; name: string };
export type ItemOption = { id: string; name: string; unit: string; stock_qty: number };

export function AddGodownDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createGodownAction({
        name: String(fd.get("name") ?? ""),
        address: String(fd.get("address") ?? ""),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Godown added.");
        setOpen(false);
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New godown
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New godown / warehouse</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gd_name">Name</Label>
            <Input id="gd_name" name="name" placeholder="Main Warehouse" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gd_addr">Address</Label>
            <Input id="gd_addr" name="address" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add godown"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TransferStockDialog({
  godowns,
  items,
}: {
  godowns: GodownOption[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [itemId, setItemId] = useState("");
  const [from, setFrom] = useState(godowns[0]?.id ?? "");
  const [to, setTo] = useState(godowns[1]?.id ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await transferStockAction({
        itemId,
        fromGodownId: from,
        toGodownId: to,
        qty: Number(fd.get("qty") ?? 0),
        notes: String(fd.get("notes") ?? ""),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Stock transferred.");
        setOpen(false);
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={godowns.length < 2}>
          <ArrowLeftRight className="size-4" /> Transfer stock
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer stock between godowns</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {godowns.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {godowns.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tr_qty">Quantity</Label>
              <Input id="tr_qty" name="qty" type="number" step="0.001" min="0" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr_notes">Notes</Label>
              <Input id="tr_notes" name="notes" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !itemId}>
              {pending ? "Transferring…" : "Transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AssignStockDialog({
  godowns,
  items,
}: {
  godowns: GodownOption[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [itemId, setItemId] = useState("");
  const [godownId, setGodownId] = useState(godowns[0]?.id ?? "");

  const item = items.find((i) => i.id === itemId);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await assignStockToGodownAction({
        itemId,
        godownId,
        qty: Number(fd.get("qty") ?? 0),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Stock assigned to godown.");
        setOpen(false);
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={godowns.length === 0}>
          <PackagePlus className="size-4" /> Assign stock
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign existing stock to a godown</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} ({i.stock_qty} {i.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Godown</Label>
              <Select value={godownId} onValueChange={setGodownId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {godowns.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="as_qty">Quantity{item ? ` (${item.unit})` : ""}</Label>
              <Input id="as_qty" name="qty" type="number" step="0.001" min="0" required />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !itemId || !godownId}>
              {pending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
