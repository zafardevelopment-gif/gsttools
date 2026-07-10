"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createPartyAction, updatePartyAction } from "@/server/actions/parties";
import { GST_STATE_CODES } from "@/lib/constants";
import { paiseToRupees } from "@/lib/money";
import { stateCodeFromGstin } from "@/lib/validation/common";
import type { PartyRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

export function PartyFormDialog({
  party,
  trigger,
}: {
  party?: PartyRow;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<PartyRow["type"]>(party?.type ?? "customer");
  const [stateCode, setStateCode] = useState(party?.state_code ?? "");
  const isEdit = !!party;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    fd.set("state_code", stateCode);
    startTransition(async () => {
      const res = isEdit
        ? await updatePartyAction(party!.id, fd)
        : await createPartyAction(fd);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(isEdit ? "Party updated." : "Party created.");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="size-4" /> New party
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit party" : "New party"}</DialogTitle>
          <DialogDescription>
            Customers, suppliers, or both. GSTIN drives intra/inter-state tax.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as PartyRow["type"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" defaultValue={party?.name} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                name="gstin"
                className="uppercase"
                defaultValue={party?.gstin ?? ""}
                onChange={(e) => {
                  const code = stateCodeFromGstin(e.target.value);
                  if (code && GST_STATE_CODES.some((s) => s.code === code))
                    setStateCode(code);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>State (place of supply)</Label>
              <Select value={stateCode} onValueChange={setStateCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {GST_STATE_CODES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={party?.phone ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={party?.email ?? ""} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="billing_address">Billing address</Label>
            <Textarea
              id="billing_address"
              name="billing_address"
              rows={2}
              defaultValue={party?.billing_address ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shipping_address">Shipping address</Label>
            <Textarea
              id="shipping_address"
              name="shipping_address"
              rows={2}
              defaultValue={party?.shipping_address ?? ""}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pan">PAN</Label>
              <Input
                id="pan"
                name="pan"
                className="uppercase"
                placeholder="ABCDE1234F"
                defaultValue={party?.pan ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="party_category">Category</Label>
              <Input
                id="party_category"
                name="category"
                placeholder="Retail / Wholesale…"
                defaultValue={party?.category ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contact_person">Contact person</Label>
              <Input
                id="contact_person"
                name="contact_person"
                defaultValue={party?.contact_person ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credit_period_days">Credit period (days)</Label>
              <Input
                id="credit_period_days"
                name="credit_period_days"
                type="number"
                min="0"
                step="1"
                defaultValue={party?.credit_period_days ?? "0"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credit_limit">Credit limit (₹)</Label>
              <Input
                id="credit_limit"
                name="credit_limit"
                type="number"
                min="0"
                step="0.01"
                defaultValue={
                  party && party.credit_limit_paise > 0
                    ? paiseToRupees(party.credit_limit_paise)
                    : "0"
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opening_balance">
              Opening balance (₹) — positive: they owe you
            </Label>
            <Input
              id="opening_balance"
              name="opening_balance"
              type="number"
              step="0.01"
              defaultValue={party ? paiseToRupees(party.opening_balance_paise) : "0"}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create party"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
