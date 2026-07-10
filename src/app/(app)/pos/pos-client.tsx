"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X, Minus, Printer, Save } from "lucide-react";
import { posCheckoutAction } from "@/server/actions/pos";
import { computeInvoiceTotals, isInterstateSupply } from "@/lib/gst";
import { formatINR, paiseToRupees, rupeesToPaise } from "@/lib/money";
import { PAYMENT_MODES, type PaymentMode } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PosItem = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  hsn_sac: string | null;
  unit: string;
  sale_price_paise: number;
  tax_rate: number;
  stock_qty: number;
  type: string;
};

export type PosParty = {
  id: string;
  name: string;
  state_code: string | null;
  gstin: string | null;
};

type CartLine = {
  itemId: string;
  name: string;
  hsn_sac: string;
  unit: string;
  qty: number;
  rate: number; // rupees
  taxRate: number;
};

type Bill = {
  key: number;
  lines: CartLine[];
  partyId: string;
};

let billSeq = 1;
const newBill = (): Bill => ({ key: billSeq++, lines: [], partyId: "" });

const CASH_PARTY = "__cash__";

export function PosClient({
  items,
  parties,
  businessStateCode,
}: {
  items: PosItem[];
  parties: PosParty[];
  businessStateCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const [bills, setBills] = useState<Bill[]>([newBill()]);
  const [activeKey, setActiveKey] = useState(bills[0].key);
  const [search, setSearch] = useState("");
  const [received, setReceived] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");

  const bill = bills.find((b) => b.key === activeKey) ?? bills[0];

  // ---- keyboard shortcuts ----------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F8") {
        e.preventDefault();
        holdAndNew();
      } else if (e.key === "F9") {
        e.preventDefault();
        checkout(false);
      } else if (e.key === "F10") {
        e.preventDefault();
        checkout(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, activeKey, received, mode]);

  // ---- item search -----------------------------------------------------------
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.sku?.toLowerCase().includes(q) ||
          i.barcode?.toLowerCase() === q ||
          i.hsn_sac?.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [items, search]);

  function updateBill(patch: Partial<Bill>) {
    setBills((prev) =>
      prev.map((b) => (b.key === bill.key ? { ...b, ...patch } : b)),
    );
  }

  function addItem(item: PosItem) {
    const existing = bill.lines.find((l) => l.itemId === item.id);
    if (existing) {
      updateBill({
        lines: bill.lines.map((l) =>
          l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l,
        ),
      });
    } else {
      updateBill({
        lines: [
          ...bill.lines,
          {
            itemId: item.id,
            name: item.name,
            hsn_sac: item.hsn_sac ?? "",
            unit: item.unit,
            qty: 1,
            rate: paiseToRupees(item.sale_price_paise),
            taxRate: item.tax_rate,
          },
        ],
      });
    }
    setSearch("");
    searchRef.current?.focus();
  }

  function setQty(itemId: string, qty: number) {
    if (qty <= 0) {
      updateBill({ lines: bill.lines.filter((l) => l.itemId !== itemId) });
    } else {
      updateBill({
        lines: bill.lines.map((l) => (l.itemId === itemId ? { ...l, qty } : l)),
      });
    }
  }

  function holdAndNew() {
    const b = newBill();
    setBills((prev) => [...prev, b]);
    setActiveKey(b.key);
    setReceived("");
    toast.info("Bill held. New billing screen started. (F8)");
  }

  function closeBill(key: number) {
    setBills((prev) => {
      const next = prev.filter((b) => b.key !== key);
      const fallback = next.length ? next : [newBill()];
      if (key === activeKey) setActiveKey(fallback[fallback.length - 1].key);
      return fallback;
    });
  }

  // ---- totals ------------------------------------------------------------------
  const party = parties.find((p) => p.id === bill.partyId);
  const interstate = isInterstateSupply(
    businessStateCode,
    party?.state_code || party?.gstin?.slice(0, 2) || undefined,
  );
  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        lines: bill.lines.map((l) => ({
          qty: l.qty,
          ratePaise: rupeesToPaise(l.rate),
          taxRate: l.taxRate,
          discountPercent: 0,
        })),
        isInterstate: interstate,
        invoiceType: "gst",
        additionalChargesPaise: 0,
        roundOff: true,
      }),
    [bill.lines, interstate],
  );

  function checkout(print: boolean) {
    if (!bill.lines.length) {
      toast.error("Bill is empty — add items first.");
      return;
    }
    const receivedNum =
      received.trim() === "" ? paiseToRupees(totals.totalPaise) : Number(received) || 0;

    startTransition(async () => {
      const res = await posCheckoutAction({
        invoice: {
          direction: "sale",
          voucherType: "invoice",
          invoiceType: "gst",
          partyId: bill.partyId && bill.partyId !== CASH_PARTY ? bill.partyId : null,
          invoiceDate: new Date().toISOString().slice(0, 10),
          additionalCharges: 0,
          roundOff: true,
          template: "classic",
          status: "final",
          lines: bill.lines.map((l) => ({
            itemId: l.itemId,
            name: l.name,
            hsn_sac: l.hsn_sac,
            unit: l.unit,
            qty: l.qty,
            rate: l.rate,
            taxRate: l.taxRate,
            discountPercent: 0,
          })),
        },
        receivedAmount: receivedNum,
        mode,
      });
      if (res.error && !res.id) {
        toast.error(res.error);
        return;
      }
      if (res.error) toast.warning(res.error);
      else toast.success("Sale saved.");
      closeBill(bill.key);
      setReceived("");
      if (print && res.id) {
        window.open(`/invoices/${res.id}/pdf`, "_blank");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col gap-3 lg:flex-row">
      {/* Left: search + item grid */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* Hold-bill tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {bills.map((b, i) => (
            <button
              key={b.key}
              onClick={() => setActiveKey(b.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-sm font-medium ${
                b.key === activeKey ? "bg-background" : "bg-muted text-muted-foreground"
              }`}
            >
              Bill {i + 1}
              {b.lines.length > 0 && (
                <Badge variant="secondary" className="px-1.5">{b.lines.length}</Badge>
              )}
              {bills.length > 1 && (
                <X
                  className="size-3.5 opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeBill(b.key);
                  }}
                />
              )}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={holdAndNew} title="Hold & new (F8)">
            <Plus className="size-4" /> Hold bill
          </Button>
        </div>

        <Input
          ref={searchRef}
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) addItem(matches[0]);
          }}
          placeholder="Search item / SKU / scan barcode…  (F2)"
          className="h-11 text-base"
        />

        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
          {matches.map((i) => (
            <button
              key={i.id}
              onClick={() => addItem(i)}
              className="flex flex-col items-start rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary"
            >
              <span className="line-clamp-2 text-sm font-medium">{i.name}</span>
              <span className="mt-1 text-xs text-muted-foreground">
                {formatINR(i.sale_price_paise)} · {i.tax_rate}%
                {i.type === "product" ? ` · ${i.stock_qty} ${i.unit}` : ""}
              </span>
            </button>
          ))}
          {matches.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No items match “{search}”.
            </p>
          )}
        </div>
      </div>

      {/* Right: bill panel */}
      <div className="flex w-full flex-col rounded-lg border bg-card lg:w-96">
        <div className="border-b p-3">
          <Select
            value={bill.partyId || CASH_PARTY}
            onValueChange={(v) => updateBill({ partyId: v === CASH_PARTY ? "" : v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={CASH_PARTY}>Cash Sale</SelectItem>
              {parties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {bill.lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Tap items to add them to the bill.
            </p>
          ) : (
            <div className="space-y-2">
              {bill.lines.map((l) => (
                <div key={l.itemId} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ₹{l.rate} × {l.qty} · {l.taxRate}%
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => setQty(l.itemId, l.qty - 1)}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-8 text-center text-sm tabular-nums">{l.qty}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => setQty(l.itemId, l.qty + 1)}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t p-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatINR(totals.taxableValuePaise)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Tax</span>
            <span className="tabular-nums">{formatINR(totals.totalTaxPaise)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(totals.totalPaise)}</span>
          </div>
          <div className="flex gap-2">
            <Input
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              placeholder={`Received (default full ₹${paiseToRupees(totals.totalPaise)})`}
            />
            <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" onClick={() => checkout(false)} disabled={pending}>
              <Save className="size-4" /> Save (F9)
            </Button>
            <Button onClick={() => checkout(true)} disabled={pending}>
              <Printer className="size-4" /> Save & Print (F10)
            </Button>
          </div>
          <p className="pt-1 text-center text-[11px] text-muted-foreground">
            F2 search · F8 hold bill · F9 save · F10 save &amp; print
          </p>
        </div>
      </div>
    </div>
  );
}
