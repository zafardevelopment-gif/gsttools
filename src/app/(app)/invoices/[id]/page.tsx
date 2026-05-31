import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getInvoice } from "@/server/queries/invoices";
import { deleteInvoiceAction } from "@/server/actions/invoices";
import { InvoiceView } from "@/components/invoice/invoice-view";
import { ShareBar } from "@/components/invoice/share-bar";
import { ConfirmDelete } from "@/components/confirm-delete";
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
      <div className="rounded-lg border">
        <InvoiceView data={data} />
      </div>
    </div>
  );
}
