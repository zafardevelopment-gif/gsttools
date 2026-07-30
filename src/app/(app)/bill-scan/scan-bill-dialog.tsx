"use client";

import { refreshWithRetry } from "@/lib/refresh-with-retry";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScanText, Loader2, ImagePlus, FileText } from "lucide-react";
import { scanBillAction, confirmBillScanAction } from "@/server/actions/bill-scan";
import { BILL_SCAN_TYPES, type BillScanType } from "@/lib/validation/bill-scan";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/constants";
import { paiseToRupees } from "@/lib/money";
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
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BillScanRow } from "@/lib/database.types";

const TYPE_LABELS: Record<BillScanType, string> = {
  purchase: "Purchase bill",
  expense: "Expense receipt",
  other: "Other",
};

type Step = "capture" | "review";

export function ScanBillDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("capture");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<BillScanType>("expense");
  const [preview, setPreview] = useState<{ url: string; isPdf: boolean; name: string } | null>(null);

  const [row, setRow] = useState<BillScanRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Review-step editable fields.
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [billDate, setBillDate] = useState("");
  const [category, setCategory] = useState<string>(DEFAULT_EXPENSE_CATEGORIES[0]);
  const [notes, setNotes] = useState("");

  function reset() {
    setStep("capture");
    setRow(null);
    setImageUrl(null);
    setAiError(null);
    setPreview(null);
    setVendor("");
    setAmount("");
    setBillDate("");
    setCategory(DEFAULT_EXPENSE_CATEGORIES[0]);
    setNotes("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview(
      file
        ? { url: URL.createObjectURL(file), isPdf: file.type === "application/pdf", name: file.name }
        : null,
    );
  }

  function onScan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    startTransition(async () => {
      const res = await scanBillAction(fd);
      if (res.error || !res.row) {
        toast.error(res.error ?? "Scan failed.");
        return;
      }
      setRow(res.row);
      setImageUrl(res.imageUrl ?? null);
      setAiError(res.row.ai_error);
      setVendor(res.row.vendor_name ?? "");
      setAmount(res.row.amount_paise != null ? String(paiseToRupees(res.row.amount_paise)) : "");
      setBillDate(res.row.bill_date ?? new Date().toISOString().slice(0, 10));
      setCategory(res.row.category || DEFAULT_EXPENSE_CATEGORIES[0]);
      setType(res.row.type);
      setStep("review");
      if (res.row.ai_error) {
        toast.warning("AI se data nahi mila — fields manually bhar dein.");
      } else {
        toast.success("Bill scan ho gaya. Check karke confirm karein.");
      }
    });
  }

  function onConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!row) return;
    const fd = new FormData(e.currentTarget);
    fd.set("id", row.id);
    fd.set("type", type);
    fd.set("category", category);
    startTransition(async () => {
      const res = await confirmBillScanAction(fd);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Bill saved.");
        setOpen(false);
        reset();
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <ScanText className="size-4" /> Scan bill
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "capture" ? (
          <>
            <DialogHeader>
              <DialogTitle>Scan a bill</DialogTitle>
              <DialogDescription>
                Purchase, expense, ya koi bhi bill camera se click karein ya file upload karein —
                AI amount, vendor, date nikaal dega.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onScan} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Bill type</Label>
                <Select value={type} onValueChange={(v) => setType(v as BillScanType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BILL_SCAN_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="image">Bill photo or PDF</Label>
                <Input
                  ref={fileRef}
                  id="image"
                  name="image"
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  required
                  onChange={onPickFile}
                />
                {preview ? (
                  preview.isPdf ? (
                    <div className="mt-2 flex h-32 flex-col items-center justify-center gap-1 rounded-md border text-muted-foreground">
                      <FileText className="size-6" />
                      <span className="max-w-[90%] truncate text-xs">{preview.name}</span>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.url}
                      alt="Bill preview"
                      className="mt-2 max-h-56 w-full rounded-md border object-contain"
                    />
                  )
                ) : (
                  <div className="mt-2 flex h-32 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                    <ImagePlus className="size-6" />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Scanning…
                    </>
                  ) : (
                    "Scan bill"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Review & confirm</DialogTitle>
              <DialogDescription>
                {aiError
                  ? "AI extraction nahi ho paya — details manually check/bhar dein."
                  : "AI ne yeh data nikala hai. Galat ho to edit karke confirm karein."}
              </DialogDescription>
            </DialogHeader>
            {imageUrl && (
              preview?.isPdf ? (
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-16 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  <FileText className="size-5" /> View uploaded PDF
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Scanned bill" className="max-h-40 w-full rounded-md border object-contain" />
              )
            )}
            <form onSubmit={onConfirm} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Bill type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as BillScanType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BILL_SCAN_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Amount (₹)</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vendor_name">Vendor / shop</Label>
                  <Input
                    id="vendor_name"
                    name="vendor_name"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bill_date">Bill date</Label>
                  <Input
                    id="bill_date"
                    name="bill_date"
                    type="date"
                    required
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEFAULT_EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep("capture")} disabled={pending}>
                  Back
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Confirm & save"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
