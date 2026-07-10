import { InvoiceForm } from "../invoice-form";
import { PageHeader } from "@/components/page-header";
import { listParties } from "@/server/queries/parties";
import { listItems } from "@/server/queries/items";
import { requireActiveContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { VOUCHER_TYPES, type VoucherTypeKey } from "@/lib/constants";

export const metadata = { title: "New invoice · GST Billing" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const voucherType: VoucherTypeKey =
    type && type in VOUCHER_TYPES ? (type as VoucherTypeKey) : "invoice";

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const [parties, items, { data: tenant }] = await Promise.all([
    listParties(),
    listItems(),
    supabase.from("aimunim_tenants").select("state_code").eq("id", tenantId).single(),
  ]);

  return (
    <div>
      <PageHeader
        title={
          voucherType === "invoice"
            ? "New invoice"
            : `New ${VOUCHER_TYPES[voucherType].label.toLowerCase()}`
        }
        description="GST auto-calculated as you type."
      />
      <InvoiceForm
        businessStateCode={tenant?.state_code ?? ""}
        suggestedNumber=""
        initialVoucherType={voucherType}
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
