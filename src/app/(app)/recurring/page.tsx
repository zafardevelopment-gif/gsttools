import { requireRouteAccess } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { NewRecurringDialog, RecurringList } from "./recurring-client";

export const metadata = { title: "Automated Bills · AI Munim" };
export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  await requireRouteAccess("/recurring");
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const [{ data: bills }, { data: parties }, { data: items }] = await Promise.all([
    supabase
      .from("aimunim_recurring_invoices")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("aimunim_parties")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("type", ["customer", "both"])
      .order("name"),
    supabase
      .from("aimunim_items")
      .select("id, name, sale_price_paise, unit")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const partyNames = Object.fromEntries((parties ?? []).map((p) => [p.id, p.name]));

  return (
    <div>
      <PageHeader
        title="Automated Bills"
        description="Recurring invoices — scheduler rozana due bills bana kar WhatsApp par bhejta hai."
        action={
          <NewRecurringDialog parties={parties ?? []} items={items ?? []} />
        }
      />
      <RecurringList bills={bills ?? []} partyNames={partyNames} />
    </div>
  );
}
