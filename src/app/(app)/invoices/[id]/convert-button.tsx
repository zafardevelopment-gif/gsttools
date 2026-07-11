"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileOutput } from "lucide-react";
import { convertToInvoiceAction } from "@/server/actions/invoices";
import { Button } from "@/components/ui/button";

/** Quotation / proforma / challan → full tax invoice, one click. */
export function ConvertButton({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function convert() {
    startTransition(async () => {
      const res = await convertToInvoiceAction(sourceId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Invoice ban gaya!");
        router.push(`/invoices/${res.id}`);
      }
    });
  }

  return (
    <Button size="sm" onClick={convert} disabled={pending}>
      <FileOutput className="size-4" />
      {pending ? "Converting…" : "Convert to invoice"}
    </Button>
  );
}
