import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { NewCampaignDialog, CampaignList } from "./marketing-client";

export const metadata = { title: "WhatsApp Marketing · GST Billing" };
export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("aimunim_campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="WhatsApp Marketing"
        description="Bulk campaigns to your party list. SMS stays built-in as a dormant fallback."
        action={<NewCampaignDialog />}
      />
      <CampaignList campaigns={campaigns ?? []} />
    </div>
  );
}
