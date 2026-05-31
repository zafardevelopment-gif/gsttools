import { InvoiceForm } from "../invoice-form";
import { PageHeader } from "@/components/page-header";
import { listParties } from "@/server/queries/parties";
import { listItems } from "@/server/queries/items";
import { requireActiveContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "New invoice · GST Billing" };

export default async function NewInvoicePage() {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const [parties, items, { data: tenant }] = await Promise.all([
    listParties(),
    listItems(),
    supabase.from("GST_tenants").select("state_code").eq("id", tenantId).single(),
  ]);

  return (
    <div>
      <PageHeader title="New invoice" description="GST auto-calculated as you type." />
      <InvoiceForm
        businessStateCode={tenant?.state_code ?? ""}
        suggestedNumber=""
        parties={parties.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          state_code: p.state_code,
          gstin: p.gstin,
        }))}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          hsn_sac: i.hsn_sac,
          unit: i.unit,
          sale_price_paise: i.sale_price_paise,
          purchase_price_paise: i.purchase_price_paise,
          tax_rate: i.tax_rate,
          type: i.type,
        }))}
      />
    </div>
  );
}
