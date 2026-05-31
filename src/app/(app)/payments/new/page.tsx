import { PageHeader } from "@/components/page-header";
import { PaymentForm } from "../payment-form";
import { listParties } from "@/server/queries/parties";
import { getInvoice } from "@/server/queries/invoices";
import { paiseToRupees } from "@/lib/money";

export const metadata = { title: "Record payment · GST Billing" };

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string; party?: string }>;
}) {
  const sp = await searchParams;
  const parties = await listParties();

  let prefill: React.ComponentProps<typeof PaymentForm>["prefill"] = sp.party
    ? { partyId: sp.party }
    : undefined;

  if (sp.invoice) {
    const inv = await getInvoice(sp.invoice);
    if (inv) {
      const due = inv.invoice.total_paise - inv.invoice.amount_paid_paise;
      prefill = {
        invoiceId: inv.invoice.id,
        invoiceLabel: inv.invoice.invoice_number,
        partyId: inv.invoice.party_id ?? undefined,
        lockParty: !!inv.invoice.party_id,
        direction: inv.invoice.direction === "sale" ? "in" : "out",
        amount: due > 0 ? paiseToRupees(due) : undefined,
      };
    }
  }

  return (
    <div>
      <PageHeader title="Record payment" description="Payment received or paid." />
      <PaymentForm
        parties={parties.map((p) => ({ id: p.id, name: p.name }))}
        prefill={prefill}
      />
    </div>
  );
}
