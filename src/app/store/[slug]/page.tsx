import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { StoreClient } from "./store-client";

export const dynamic = "force-dynamic";

/**
 * Public online storefront (spec Module 14). No auth — the slug identifies the
 * business; only active items of a store-enabled tenant are shown.
 */
export default async function StorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("aimunim_tenants")
    .select("id, name, city, state, phone, store_enabled")
    .eq("store_slug", slug)
    .maybeSingle();
  if (!tenant?.store_enabled) notFound();

  const { data: items } = await admin
    .from("aimunim_items")
    .select("id, name, unit, category, sale_price_paise, description, image_path")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .order("name");

  const withImages = (items ?? []).map((i) => ({
    ...i,
    imageUrl: i.image_path
      ? `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${i.image_path}`
      : null,
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Store className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[tenant.city, tenant.state].filter(Boolean).join(", ")}
            {tenant.phone ? ` · ${tenant.phone}` : ""}
          </p>
        </div>
      </header>
      <StoreClient slug={slug} items={withImages} />
    </main>
  );
}
