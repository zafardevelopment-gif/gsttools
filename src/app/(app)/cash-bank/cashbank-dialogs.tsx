"use client";

import { refreshWithRetry } from "@/lib/refresh-with-retry";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ArrowLeftRight, Wallet } from "lucide-react";
import {
  createBankAccountAction,
  addAdjustmentAction,
  transferMoneyAction,
} from "@/server/actions/cashbank";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export type AccountOption = { id: string; name: string };

const CASH = "cash";
const today = () => new Date().toISOString().slice(0, 10);

export function AddBankAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createBankAccountAction({
        name: String(fd.get("name") ?? ""),
        accountNumber: String(fd.get("account_number") ?? ""),
        ifsc: String(fd.get("ifsc") ?? ""),
        openingBalance: Number(fd.get("opening_balance") ?? 0),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Bank account added.");
        setOpen(false);
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="size-4" /> Bank account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add bank account</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Account name</Label>
            <Input id="name" name="name" placeholder="HDFC Current A/c" required />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="account_number">Account number</Label>
              <Input id="account_number" name="account_number" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ifsc">IFSC</Label>
              <Input id="ifsc" name="ifsc" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opening_balance">Opening balance (₹)</Label>
            <Input
              id="opening_balance"
              name="opening_balance"
              type="number"
              step="0.01"
              placeholder="0"
              defaultValue=""
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustMoneyDialog({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [account, setAccount] = useState<string>(CASH);
  const [direction, setDirection] = useState<"in" | "out">("in");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addAdjustmentAction({
        accountId: account === CASH ? null : account,
        direction,
        amount: Number(fd.get("amount") ?? 0),
        txnDate: String(fd.get("txn_date") ?? today()),
        notes: String(fd.get("notes") ?? ""),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Entry added.");
        setOpen(false);
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Wallet className="size-4" /> Add / Reduce money
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add / reduce money</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Ledger</Label>
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CASH}>Cash in hand</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "in" | "out")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Add money</SelectItem>
                  <SelectItem value="out">Reduce money</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="adj_amount">Amount (₹)</Label>
              <Input id="adj_amount" name="amount" type="number" step="0.01" min="0" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj_date">Date</Label>
              <Input id="adj_date" name="txn_date" type="date" defaultValue={today()} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj_notes">Notes</Label>
            <Textarea id="adj_notes" name="notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TransferMoneyDialog({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState<string>(CASH);
  const [to, setTo] = useState<string>(accounts[0]?.id ?? CASH);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await transferMoneyAction({
        fromAccountId: from === CASH ? null : from,
        toAccountId: to === CASH ? null : to,
        amount: Number(fd.get("amount") ?? 0),
        txnDate: String(fd.get("txn_date") ?? today()),
        notes: String(fd.get("notes") ?? ""),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Transfer recorded.");
        setOpen(false);
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowLeftRight className="size-4" /> Transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer money</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CASH}>Cash in hand</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CASH}>Cash in hand</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tr_amount">Amount (₹)</Label>
              <Input id="tr_amount" name="amount" type="number" step="0.01" min="0" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr_date">Date</Label>
              <Input id="tr_date" name="txn_date" type="date" defaultValue={today()} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr_notes">Notes</Label>
            <Textarea id="tr_notes" name="notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
