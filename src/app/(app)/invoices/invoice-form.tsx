"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createInvoiceAction, updateInvoiceAction } from "@/server/actions/invoices";
import { computeInvoiceTotals, isInterstateSupply } from "@/lib/gst";
import { formatINR, paiseToRupees, rupeesToPaise } from "@/lib/money";
import {
  GST_RATES,
  STATE_CODE_TO_NAME,
  VOUCHER_TYPES,
  SALE_VOUCHER_TYPES,
  PURCHASE_VOUCHER_TYPES,
  INVOICE_THEMES,
  type VoucherTypeKey,
  type InvoiceThemeKey,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PartyOption = {
  id: string;
  name: string;
  type: string;
  state_code: string | null;
  gstin: string | null;
  pricing_tier?: "retail" | "wholesale";
};
export type ItemOption = {
  id: string;
  name: string;
  hsn_sac: string | null;
  unit: string;
  sale_price_paise: number;
  purchase_price_paise: number;
  wholesale_price_paise?: number;
  tax_rate: number;
  type: string;
};

type Line = {
  key: number;
  itemId: string | null;
  name: string;
  hsn_sac: string;
  unit: string;
  qty: string;
  rate: string;
  taxRate: string;
  discountPercent: string;
};

let lineSeq = 1;
const emptyLine = (): Line => ({
  key: lineSeq++,
  itemId: null,
  name: "",
  hsn_sac: "",
  unit: "PCS",
  qty: "1",
  rate: "",
  taxRate: "18",
  discountPercent: "0",
});

export function InvoiceForm({
  parties,
  items,
  businessStateCode,
  suggestedNumber,
  initialVoucherType = "invoice",
  initialTheme = "classic",
  editId,
  initial,
}: {
  parties: PartyOption[];
  items: ItemOption[];
  businessStateCode: string;
  suggestedNumber: string;
  initialVoucherType?: VoucherTypeKey;
  initialTheme?: string;
  /** When set, the form edits this voucher instead of creating a new one. */
  editId?: string;
  initial?: {
    direction: "sale" | "purchase";
    invoiceType: "gst" | "non_gst";
    partyId: string | null;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string | null;
    additionalCharges: number; // rupees
    roundOff: boolean;
    notes: string;
    terms: string;
    lines: {
      itemId: string | null;
      name: string;
      hsn_sac: string;
      unit: string;
      qty: number;
      rate: number; // rupees
      taxRate: number;
      discountPercent: number;
    }[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [voucherType, setVoucherType] =
    useState<VoucherTypeKey>(initialVoucherType);
  const [direction, setDirection] = useState<"sale" | "purchase">(
    initial?.direction ?? VOUCHER_TYPES[initialVoucherType].direction,
  );
  const [invoiceType, setInvoiceType] = useState<"gst" | "non_gst">(
    initial?.invoiceType ?? "gst",
  );
  const [partyId, setPartyId] = useState<string>(initial?.partyId ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(
    initial?.invoiceNumber ?? suggestedNumber,
  );
  const [invoiceDate, setInvoiceDate] = useState(
    initial?.invoiceDate ?? new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [additionalCharges, setAdditionalCharges] = useState(
    initial ? String(initial.additionalCharges) : "0",
  );
  const [roundOff, setRoundOff] = useState(initial?.roundOff ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [template, setTemplate] = useState<InvoiceThemeKey>(
    (initialTheme as InvoiceThemeKey) in INVOICE_THEMES
      ? (initialTheme as InvoiceThemeKey)
      : "classic",
  );
  const [lines, setLines] = useState<Line[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({
          key: lineSeq++,
          itemId: l.itemId,
          name: l.name,
          hsn_sac: l.hsn_sac,
          unit: l.unit,
          qty: String(l.qty),
          rate: String(l.rate),
          taxRate: String(l.taxRate),
          discountPercent: String(l.discountPercent),
        }))
      : [emptyLine()],
  );

  // Which line's item-name field currently has its type-ahead suggestion
  // list open (by line key). Typing in "Item name" now filters the catalog
  // directly instead of requiring the separate "Pick item" dropdown.
  const [openSuggestKey, setOpenSuggestKey] = useState<number | null>(null);

  // Customer/Supplier is a type-ahead field too (see Item field below for the
  // same pattern) rather than a plain <Select>. The old Select version had a
  // real, reproducible bug: with few/one parties in the list, its popover
  // content aligns directly over the trigger, so a single click can open and
  // "preview" a highlighted option without actually committing it — the
  // trigger shows the party name, but the underlying partyId state never
  // changed. Any later click elsewhere on the page (e.g. into the item
  // field) then closes that never-committed popover and the display reverts
  // to "Select party" — except it isn't just a display glitch: partyId was
  // genuinely still "", so a save at that point silently produced an invoice
  // billed to "Cash / walk-in" instead of the intended customer. Switching
  // to the same search-as-you-type + explicit-click-to-select pattern used
  // for items removes the ambiguous single-click-commit path entirely.
  const [partyQuery, setPartyQuery] = useState(
    initial?.partyId
      ? (parties.find((p) => p.id === initial.partyId)?.name ?? "")
      : "",
  );
  const [openPartySuggest, setOpenPartySuggest] = useState(false);

  const party = parties.find((p) => p.id === partyId);
  const placeOfSupply = party?.state_code || party?.gstin?.slice(0, 2) || undefined;
  const interstate = isInterstateSupply(businessStateCode, placeOfSupply);

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        lines: lines.map((l) => ({
          qty: Number(l.qty) || 0,
          ratePaise: rupeesToPaise(Number(l.rate) || 0),
          taxRate: Number(l.taxRate) || 0,
          discountPercent: Number(l.discountPercent) || 0,
        })),
        isInterstate: interstate,
        invoiceType,
        additionalChargesPaise: rupeesToPaise(Number(additionalCharges) || 0),
        roundOff,
      }),
    [lines, interstate, invoiceType, additionalCharges, roundOff],
  );

  function pickParty(p: PartyOption) {
    setPartyId(p.id);
    setPartyQuery(p.name);
    setOpenPartySuggest(false);
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickItem(key: number, itemId: string) {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    // Wholesale parties get the wholesale price (falls back to retail).
    const isWholesale = party?.pricing_tier === "wholesale";
    const salePaise =
      isWholesale && (it.wholesale_price_paise ?? 0) > 0
        ? it.wholesale_price_paise!
        : it.sale_price_paise;
    const ratePaise =
      direction === "purchase" ? it.purchase_price_paise : salePaise;
    updateLine(key, {
      itemId: it.id,
      name: it.name,
      hsn_sac: it.hsn_sac ?? "",
      unit: it.unit,
      rate: String(paiseToRupees(ratePaise)),
      taxRate: String(it.tax_rate),
    });
  }

  function submit(status: "draft" | "final") {
    if (lines.every((l) => !l.name.trim())) {
      toast.error("Add at least one line item.");
      return;
    }
    startTransition(async () => {
      const payload = {
        direction,
        voucherType,
        invoiceType,
        partyId: partyId || null,
        invoiceNumber: invoiceNumber || undefined,
        invoiceDate,
        dueDate: dueDate || null,
        additionalCharges: Number(additionalCharges) || 0,
        roundOff,
        notes,
        terms,
        template,
        status,
        lines: lines
          .filter((l) => l.name.trim())
          .map((l) => ({
            itemId: l.itemId,
            name: l.name,
            hsn_sac: l.hsn_sac,
            unit: l.unit,
            qty: Number(l.qty) || 0,
            rate: Number(l.rate) || 0,
            taxRate: Number(l.taxRate) || 0,
            discountPercent: Number(l.discountPercent) || 0,
          })),
      };
      const res = editId
        ? await updateInvoiceAction(editId, payload)
        : await createInvoiceAction(payload);
      if (res.error) toast.error(res.error);
      else {
        toast.success(editId ? "Invoice updated." : "Invoice saved.");
        router.push(`/invoices/${res.id}`);
      }
    });
  }

  const relevantParties = parties.filter((p) =>
    direction === "purchase"
      ? p.type === "supplier" || p.type === "both"
      : p.type === "customer" || p.type === "both",
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Voucher</Label>
            <Select
              value={`${direction}:${voucherType}`}
              disabled={!!editId}
              onValueChange={(v) => {
                const [dir, vt] = v.split(":") as [
                  "sale" | "purchase",
                  VoucherTypeKey,
                ];
                setDirection(dir);
                setVoucherType(vt);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SALE_VOUCHER_TYPES.map((vt) => (
                  <SelectItem key={`sale:${vt}`} value={`sale:${vt}`}>
                    {vt === "invoice" ? "Sales invoice" : VOUCHER_TYPES[vt].label}
                  </SelectItem>
                ))}
                {PURCHASE_VOUCHER_TYPES.map((vt) => (
                  <SelectItem key={`purchase:${vt}`} value={`purchase:${vt}`}>
                    {vt === "invoice" ? "Purchase bill" : VOUCHER_TYPES[vt].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>GST</Label>
            <Select value={invoiceType} onValueChange={(v) => setInvoiceType(v as "gst" | "non_gst")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gst">GST invoice</SelectItem>
                <SelectItem value="non_gst">Non-GST / cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Theme</Label>
            <Select
              value={template}
              onValueChange={(v) => setTemplate(v as InvoiceThemeKey)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(INVOICE_THEMES) as InvoiceThemeKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-3 rounded-full"
                        style={{ backgroundColor: INVOICE_THEMES[k].accent }}
                      />
                      {INVOICE_THEMES[k].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative space-y-1.5">
            <Label>{direction === "purchase" ? "Supplier" : "Customer"}</Label>
            <Input
              className="h-11 text-base"
              placeholder={`Type to search ${direction === "purchase" ? "suppliers" : "customers"}…`}
              value={partyQuery}
              onChange={(e) => {
                setPartyQuery(e.target.value);
                setPartyId("");
                setOpenPartySuggest(true);
              }}
              onFocus={() => setOpenPartySuggest(true)}
              onBlur={() => {
                // Delay so a click on a suggestion registers first.
                setTimeout(() => setOpenPartySuggest(false), 150);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpenPartySuggest(false);
              }}
              autoComplete="off"
            />
            {openPartySuggest && (() => {
              const q = partyQuery.trim().toLowerCase();
              const matches = (
                q
                  ? relevantParties.filter((p) => p.name.toLowerCase().includes(q))
                  : relevantParties
              ).slice(0, 8);
              if (matches.length === 0) {
                return (
                  <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
                    {relevantParties.length === 0
                      ? "No parties yet — add one from Parties."
                      : "No match."}
                  </div>
                );
              }
              return (
                <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md">
                  {matches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      onMouseDown={(e) => {
                        // mousedown (not click) so it fires before the input's onBlur.
                        e.preventDefault();
                        pickParty(p);
                      }}
                    >
                      <span>{p.name}</span>
                      {p.gstin && (
                        <span className="text-xs text-muted-foreground">{p.gstin}</span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="space-y-1.5">
            <Label>Invoice number</Label>
            <Input
              value={invoiceNumber}
              placeholder="Auto-generated on save"
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          {invoiceType === "gst" && (
            <div className="md:col-span-3">
              <Badge variant={interstate ? "default" : "secondary"}>
                {interstate ? "Inter-state · IGST" : "Intra-state · CGST + SGST"}
              </Badge>
              {placeOfSupply && (
                <span className="ml-2 text-xs text-muted-foreground">
                  Place of supply: {STATE_CODE_TO_NAME[placeOfSupply] ?? placeOfSupply}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="hidden gap-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[1fr_5rem_6rem_4rem_5rem_7rem_2rem]">
            <span>Item</span><span>Qty</span><span>Rate ₹</span><span>Disc %</span>
            <span>GST %</span><span className="text-right">Amount</span><span />
          </div>
          {lines.map((l, idx) => (
            <div
              key={l.key}
              className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_5rem_6rem_4rem_5rem_7rem_2rem] md:items-center"
            >
              <div className="relative col-span-2 md:col-span-1">
                <Input
                  placeholder="Type to search items…"
                  value={l.name}
                  onChange={(e) => {
                    updateLine(l.key, { name: e.target.value, itemId: null });
                    setOpenSuggestKey(l.key);
                  }}
                  onFocus={() => setOpenSuggestKey(l.key)}
                  onBlur={() => {
                    // Delay so the click on a suggestion registers first.
                    setTimeout(() => setOpenSuggestKey((k) => (k === l.key ? null : k)), 150);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setOpenSuggestKey(null);
                  }}
                  autoComplete="off"
                />
                {openSuggestKey === l.key && items.length > 0 && (() => {
                  const q = l.name.trim().toLowerCase();
                  const matches = (
                    q
                      ? items.filter((i) => i.name.toLowerCase().includes(q))
                      : items
                  ).slice(0, 8);
                  if (matches.length === 0) return null;
                  return (
                    <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md">
                      {matches.map((i) => (
                        <button
                          key={i.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={(e) => {
                            // mousedown (not click) so it fires before the input's onBlur.
                            e.preventDefault();
                            pickItem(l.key, i.id);
                            setOpenSuggestKey(null);
                          }}
                        >
                          <span>{i.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatINR(i.sale_price_paise)}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <Input type="number" step="0.001" min="0" value={l.qty}
                onChange={(e) => updateLine(l.key, { qty: e.target.value })} />
              <Input type="number" step="0.01" min="0" value={l.rate}
                onChange={(e) => updateLine(l.key, { rate: e.target.value })} />
              <Input type="number" step="0.01" min="0" max="100" value={l.discountPercent}
                onChange={(e) => updateLine(l.key, { discountPercent: e.target.value })} />
              <Select value={l.taxRate} onValueChange={(v) => updateLine(l.key, { taxRate: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GST_RATES.map((r) => (
                    <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-right text-sm tabular-nums">
                {formatINR(totals.lines[idx]?.amountPaise ?? 0)}
              </div>
              <Button
                variant="ghost" size="icon" type="button"
                onClick={() => setLines((p) => (p.length > 1 ? p.filter((x) => x.key !== l.key) : p))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" type="button" onClick={() => setLines((p) => [...p, emptyLine()])}>
            <Plus className="size-4" /> Add line
          </Button>
        </CardContent>
      </Card>

      {/* Totals + meta */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Terms</Label>
              <Textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Additional charges ₹</Label>
                <Input type="number" step="0.01" min="0" value={additionalCharges}
                  onChange={(e) => setAdditionalCharges(e.target.value)} />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={roundOff} onChange={(e) => setRoundOff(e.target.checked)} />
                Round off total
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            <Row label="Taxable value" value={formatINR(totals.taxableValuePaise)} />
            {totals.discountPaise > 0 && (
              <Row label="Discount" value={`- ${formatINR(totals.discountPaise)}`} />
            )}
            {interstate ? (
              <Row label="IGST" value={formatINR(totals.igstPaise)} />
            ) : (
              <>
                <Row label="CGST" value={formatINR(totals.cgstPaise)} />
                <Row label="SGST" value={formatINR(totals.sgstPaise)} />
              </>
            )}
            {totals.additionalChargesPaise > 0 && (
              <Row label="Additional charges" value={formatINR(totals.additionalChargesPaise)} />
            )}
            {totals.roundOffPaise !== 0 && (
              <Row label="Round off" value={formatINR(totals.roundOffPaise)} />
            )}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{formatINR(totals.totalPaise)}</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => submit("final")} disabled={pending}>
                {pending ? "Saving…" : "Save invoice"}
              </Button>
              <Button variant="outline" onClick={() => submit("draft")} disabled={pending}>
                Save as draft
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
