import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { LabelClient } from "./label-client";

export const metadata = { title: "Print label · AI Munim" };
export const dynamic = "force-dynamic";

export default async function ItemLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const [{ data: item }, { data: tenant }] = await Promise.all([
    supabase
      .from("aimunim_items")
      .select("name, sku, barcode, sale_price_paise, mrp_paise, unit")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("aimunim_tenants").select("name").eq("id", tenantId).single(),
  ]);
  if (!item) notFound();

  return (
    <div>
      <div className="print:hidden">
        <Link
          href="/items"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to items
        </Link>
        <PageHeader
          title={`Price tag — ${item.name}`}
          description="Barcode label size aur content chunein, phir print karen."
        />
      </div>
      <LabelClient item={item} businessName={tenant?.name ?? ""} />
    </div>
  );
}
