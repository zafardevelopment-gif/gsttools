import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getInvoice } from "@/server/queries/invoices";
import { deleteInvoiceAction } from "@/server/actions/invoices";
import { InvoiceView } from "@/components/invoice/invoice-view";
import { getInvoiceRenderExtras } from "@/server/invoice-extras";
import { ShareBar } from "@/components/invoice/share-bar";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EInvoicePanel } from "./einvoice-panel";
import { ConvertButton } from "./convert-button";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";
import { formatINR } from "@/lib/money";

export const metadata = { title: "Invoice · GST Billing" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getInvoice(id);
  if (!data) notFound();
  const extras = await getInvoiceRenderExtras(data);

  async function onDelete() {
    "use server";
    const res = await deleteInvoiceAction(id);
    if (res.ok) redirect("/invoices");
    return res;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/invoices">← All invoices</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <ShareBar
            pdfUrl={`${publicEnv.NEXT_PUBLIC_SITE_URL}/invoices/${id}/pdf`}
            invoiceNumber={data.invoice.invoice_number}
            totalLabel={formatINR(data.invoice.total_paise)}
            businessName={data.tenant.name}
            partyPhone={data.party?.phone}
            partyEmail={data.party?.email}
          />
          {["quotation", "proforma", "delivery_challan"].includes(
            data.invoice.voucher_type,
          ) && <ConvertButton sourceId={id} />}
          <Button asChild variant="outline" size="sm">
            <Link href={`/invoices/${id}/edit`}>
              <Pencil className="size-3.5" /> Edit
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/payments/new?invoice=${id}`}>Record payment</Link>
          </Button>
          <ConfirmDelete
            title="Delete invoice?"
            description="The invoice and its stock effect will be reversed."
            onConfirm={onDelete}
            trigger={<Button variant="destructive" size="sm">Delete</Button>}
          />
        </div>
      </div>
      {data.invoice.direction === "sale" &&
        data.invoice.voucher_type === "invoice" &&
        data.invoice.invoice_type === "gst" &&
        data.invoice.status !== "draft" && (
          <EInvoicePanel
            invoiceId={id}
            irn={data.invoice.irn}
            irnGeneratedAt={data.invoice.irn_generated_at}
            ewayBillNo={data.invoice.eway_bill_no}
          />
        )}
      <div className="rounded-lg border">
        <InvoiceView data={data} extras={extras} />
      </div>
    </div>
  );
}
