import { PageHeader } from "@/components/page-header";
import { PaymentForm } from "../payment-form";
import { listParties } from "@/server/queries/parties";
import { getInvoice } from "@/server/queries/invoices";
import { paiseToRupees } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";

export const metadata = { title: "Record payment · GST Billing" };
export const dynamic = "force-dynamic";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string; party?: string }>;
}) {
  const sp = await searchParams;
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const [parties, { data: unpaid }] = await Promise.all([
    listParties(),
    supabase
      .from("aimunim_invoices")
      .select("id, invoice_number, invoice_date, direction, party_id, total_paise, amount_paid_paise")
      .eq("tenant_id", tenantId)
      .eq("voucher_type", "invoice")
      .in("status", ["unpaid", "partial"])
      .order("invoice_date"),
  ]);

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
        unpaidInvoices={(unpaid ?? [])
          .filter((i) => i.party_id)
          .map((i) => ({
            id: i.id,
            number: i.invoice_number,
            date: i.invoice_date,
            direction: i.direction,
            partyId: i.party_id as string,
            dueRupees: paiseToRupees(i.total_paise - i.amount_paid_paise),
          }))}
      />
    </div>
  );
}
