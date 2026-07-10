"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Minus, ShoppingCart, Search } from "lucide-react";
import { placeOrderAction } from "@/server/actions/store";
import { formatINR } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type StoreItem = {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  sale_price_paise: number;
  description: string | null;
};

export function StoreClient({ slug, items }: { slug: string; items: StoreItem[] }) {
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [placed, setPlaced] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<"cod" | "upi" | "online">("cod");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q),
    );
  }, [items, search]);

  const cartLines = [...cart.entries()]
    .map(([id, qty]) => ({ item: items.find((i) => i.id === id), qty }))
    .filter((l) => l.item && l.qty > 0) as { item: StoreItem; qty: number }[];
  const totalPaise = cartLines.reduce(
    (s, l) => s + l.item.sale_price_paise * l.qty,
    0,
  );

  function setQty(id: string, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await placeOrderAction({
        slug,
        customerName: String(fd.get("name") ?? ""),
        customerPhone: String(fd.get("phone") ?? ""),
        address: String(fd.get("address") ?? ""),
        paymentMode,
        lines: cartLines.map((l) => ({ itemId: l.item.id, qty: l.qty })),
      });
      if (res.error) toast.error(res.error);
      else {
        setPlaced(res.orderNumber!);
        setCart(new Map());
      }
    });
  }

  if (placed) {
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
        <p className="text-3xl">🎉</p>
        <h2 className="mt-2 text-lg font-bold">Order mil gaya!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Order number: <span className="font-mono font-semibold">{placed}</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Dukaan aapse jald hi contact karegi.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => setPlaced(null)}>
          Naya order karen
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Catalog */}
      <div className="flex-1">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Item search karen…"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((i) => {
            const qty = cart.get(i.id) ?? 0;
            return (
              <Card key={i.id}>
                <CardContent className="flex flex-col gap-2 p-3">
                  <div>
                    <p className="font-medium leading-tight">{i.name}</p>
                    {i.description && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {i.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold tabular-nums">
                      {formatINR(i.sale_price_paise)}
                      <span className="text-xs font-normal text-muted-foreground">
                        /{i.unit}
                      </span>
                    </span>
                    {qty === 0 ? (
                      <Button size="sm" onClick={() => setQty(i.id, 1)}>
                        <Plus className="size-3.5" /> Add
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => setQty(i.id, qty - 1)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-7 text-center text-sm tabular-nums">{qty}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => setQty(i.id, qty + 1)}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              Koi item nahi mila.
            </p>
          )}
        </div>
      </div>

      {/* Cart + checkout */}
      <div className="w-full rounded-lg border bg-card p-4 lg:w-96 lg:self-start">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <ShoppingCart className="size-4" /> Cart ({cartLines.length})
        </h2>
        {cartLines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Items add karen.
          </p>
        ) : (
          <div className="mb-3 space-y-1.5 text-sm">
            {cartLines.map((l) => (
              <div key={l.item.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {l.item.name} × {l.qty}
                </span>
                <span className="tabular-nums">
                  {formatINR(l.item.sale_price_paise * l.qty)}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1.5 font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatINR(totalPaise)}</span>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="st_name">Naam</Label>
            <Input id="st_name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st_phone">Phone (WhatsApp)</Label>
            <Input id="st_phone" name="phone" type="tel" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st_address">Delivery address</Label>
            <Input id="st_address" name="address" />
          </div>
          <div className="space-y-1.5">
            <Label>Payment</Label>
            <Select
              value={paymentMode}
              onValueChange={(v) => setPaymentMode(v as typeof paymentMode)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cod">Cash on delivery</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            type="submit"
            disabled={pending || cartLines.length === 0}
          >
            {pending ? "Placing order…" : `Order karen — ${formatINR(totalPaise)}`}
          </Button>
        </form>
      </div>
    </div>
  );
}
