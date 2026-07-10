import { PageHeader } from "@/components/page-header";
import { listParties } from "@/server/queries/parties";
import { listItems } from "@/server/queries/items";
import { requireActiveContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { PosClient } from "./pos-client";

export const metadata = { title: "POS Billing · GST Billing" };
export const dynamic = "force-dynamic";

export default async function PosPage() {
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
        title="POS Billing"
        description="Fast counter billing — tap items, hold bills, save & print."
      />
      <PosClient
        businessStateCode={tenant?.state_code ?? ""}
        items={items
          .filter((i) => i.is_active)
          .map((i) => ({
            id: i.id,
            name: i.name,
            sku: i.sku,
            barcode: i.barcode ?? null,
            hsn_sac: i.hsn_sac,
            unit: i.unit,
            sale_price_paise: i.sale_price_paise,
            wholesale_price_paise: i.wholesale_price_paise,
            tax_rate: i.tax_rate,
            stock_qty: i.stock_qty,
            type: i.type,
          }))}
        parties={parties.map((p) => ({
          id: p.id,
          name: p.name,
          state_code: p.state_code,
          gstin: p.gstin,
          pricing_tier: p.pricing_tier,
        }))}
      />
    </div>
  );
}
