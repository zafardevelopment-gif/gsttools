import { notFound } from "next/navigation";
import { InvoiceForm } from "../../invoice-form";
import { PageHeader } from "@/components/page-header";
import { getInvoice } from "@/server/queries/invoices";
import { listParties } from "@/server/queries/parties";
import { listItems } from "@/server/queries/items";
import { paiseToRupees } from "@/lib/money";
import { VOUCHER_TYPES, type VoucherTypeKey } from "@/lib/constants";

export const metadata = { title: "Edit invoice · AI Munim" };
export const dynamic = "force-dynamic";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, parties, items] = await Promise.all([
    getInvoice(id),
    listParties(),
    listItems(),
  ]);
  if (!data) notFound();
  const { invoice, items: lines, tenant } = data;

  return (
    <div>
      <PageHeader
        title={`Edit ${VOUCHER_TYPES[invoice.voucher_type]?.shortLabel ?? "voucher"} ${invoice.invoice_number}`}
        description="Lines badalne par stock aur party balance apne aap adjust ho jayega."
      />
      <InvoiceForm
        editId={id}
        businessStateCode={tenant.state_code}
        suggestedNumber={invoice.invoice_number}
        initialVoucherType={invoice.voucher_type as VoucherTypeKey}
        initialTheme={invoice.template}
        initial={{
          direction: invoice.direction,
          invoiceType: invoice.invoice_type,
          partyId: invoice.party_id,
          invoiceNumber: invoice.invoice_number,
          invoiceDate: invoice.invoice_date,
          dueDate: invoice.due_date,
          additionalCharges: paiseToRupees(invoice.additional_charges_paise),
          roundOff: invoice.round_off_paise !== 0 || true,
          notes: invoice.notes ?? "",
          terms: invoice.terms ?? "",
          lines: lines.map((l) => ({
            itemId: l.item_id,
            name: l.name,
            hsn_sac: l.hsn_sac ?? "",
            unit: l.unit,
            qty: l.qty,
            rate: paiseToRupees(l.rate_paise),
            taxRate: l.tax_rate,
            discountPercent: l.discount_percent,
          })),
        }}
        parties={parties.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          state_code: p.state_code,
          gstin: p.gstin,
          pricing_tier: p.pricing_tier,
        }))}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          hsn_sac: i.hsn_sac,
          unit: i.unit,
          sale_price_paise: i.sale_price_paise,
          purchase_price_paise: i.purchase_price_paise,
          wholesale_price_paise: i.wholesale_price_paise,
          tax_rate: i.tax_rate,
          type: i.type,
        }))}
      />
    </div>
  );
}
