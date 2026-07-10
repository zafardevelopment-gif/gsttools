"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileCheck2, Truck } from "lucide-react";
import {
  generateEInvoiceAction,
  generateEwayBillAction,
} from "@/server/actions/einvoice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * e-Invoicing panel (mock IRP for now): generate IRN, then the e-Way bill.
 * Only rendered for finalised GST sale invoices.
 */
export function EInvoicePanel({
  invoiceId,
  irn,
  irnGeneratedAt,
  ewayBillNo,
}: {
  invoiceId: string;
  irn: string | null;
  irnGeneratedAt: string | null;
  ewayBillNo: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function genIrn() {
    startTransition(async () => {
      const res = await generateEInvoiceAction(invoiceId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("e-Invoice (IRN) generated.");
        router.refresh();
      }
    });
  }

  function genEway() {
    startTransition(async () => {
      const res = await generateEwayBillAction(invoiceId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("e-Way bill generated.");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-semibold">e-Invoicing</p>
        <Badge variant="secondary">Sandbox / mock</Badge>
      </div>
      {irn ? (
        <div className="space-y-1 text-sm">
          <p className="break-all">
            <span className="text-muted-foreground">IRN: </span>
            <span className="font-mono text-xs">{irn}</span>
          </p>
          {irnGeneratedAt && (
            <p className="text-xs text-muted-foreground">
              Generated {irnGeneratedAt.slice(0, 16).replace("T", " ")}
            </p>
          )}
          {ewayBillNo ? (
            <p>
              <span className="text-muted-foreground">e-Way bill: </span>
              <span className="font-mono">{ewayBillNo}</span>
            </p>
          ) : (
            <Button size="sm" variant="outline" onClick={genEway} disabled={pending}>
              <Truck className="size-3.5" /> Generate e-Way bill
            </Button>
          )}
        </div>
      ) : (
        <Button size="sm" onClick={genIrn} disabled={pending}>
          <FileCheck2 className="size-3.5" />
          {pending ? "Generating…" : "Generate e-Invoice (IRN)"}
        </Button>
      )}
    </div>
  );
}
