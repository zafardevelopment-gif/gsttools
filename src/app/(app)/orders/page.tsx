import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { OrdersTable } from "./orders-client";

export const metadata = { title: "Online Orders · GST Billing" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("aimunim_online_orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="Online Orders"
        description="Orders from your online store and WhatsApp catalog flows."
      />
      <OrdersTable orders={orders ?? []} />
    </div>
  );
}
