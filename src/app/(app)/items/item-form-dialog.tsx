"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createItemAction, updateItemAction } from "@/server/actions/items";
import { UNITS, GST_RATES } from "@/lib/constants";
import { paiseToRupees } from "@/lib/money";
import type { ItemRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function ItemFormDialog({
  item,
  trigger,
}: {
  item?: ItemRow;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<"product" | "service">(item?.type ?? "product");
  const [unit, setUnit] = useState(item?.unit ?? "PCS");
  const [taxRate, setTaxRate] = useState(String(item?.tax_rate ?? 18));
  const isEdit = !!item;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    fd.set("unit", unit);
    fd.set("tax_rate", taxRate);
    startTransition(async () => {
      const res = isEdit
        ? await updateItemAction(item!.id, fd)
        : await createItemAction(fd);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(isEdit ? "Item updated." : "Item created.");
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
            <Plus className="size-4" /> New item
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit item" : "New item"}</DialogTitle>
          <DialogDescription>
            Products track stock; services don&apos;t.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" defaultValue={item?.name} required />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" name="sku" defaultValue={item?.sku ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hsn_sac">HSN/SAC</Label>
              <Input id="hsn_sac" name="hsn_sac" defaultValue={item?.hsn_sac ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Input id="category" name="category" defaultValue={item?.category ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>GST rate (%)</Label>
              <Select value={taxRate} onValueChange={setTaxRate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GST_RATES.map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale_price">Sale price (₹)</Label>
              <Input
                id="sale_price"
                name="sale_price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={item ? paiseToRupees(item.sale_price_paise) : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchase_price">Purchase price (₹)</Label>
              <Input
                id="purchase_price"
                name="purchase_price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={item ? paiseToRupees(item.purchase_price_paise) : ""}
              />
            </div>
          </div>

          {type === "product" && (
            <div className="grid grid-cols-2 gap-3">
              {!isEdit && (
                <div className="space-y-1.5">
                  <Label htmlFor="opening_stock">Opening stock</Label>
                  <Input
                    id="opening_stock"
                    name="opening_stock"
                    type="number"
                    step="0.001"
                    min="0"
                    defaultValue="0"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="low_stock_level">Low-stock alert at</Label>
                <Input
                  id="low_stock_level"
                  name="low_stock_level"
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue={item ? item.low_stock_level : "0"}
                />
              </div>
              {isEdit && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  Current stock: {item!.stock_qty} {item!.unit}. Stock changes via
                  invoices and adjustments.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
