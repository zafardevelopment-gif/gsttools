import { requireRouteAccess } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SettingsForm } from "./settings-form";
import { PreferencesForm } from "./preferences-form";
import { BusinessExtrasForm } from "./business-extras-form";
import { InvoiceSettingsForm } from "./invoice-settings-form";
import { RemindersForm } from "./reminders-form";
import { getAppContext } from "@/server/queries/app-context";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceSettings } from "@/lib/database.types";

export const metadata = { title: "Settings · AI Munim" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRouteAccess("/settings");
  const ctx = await getAppContext();
  const tenant = ctx.activeTenant;
  const printSettings = (tenant?.print_settings ?? {}) as { paper?: string };
  const invoiceSettings = (tenant?.invoice_settings ?? {}) as InvoiceSettings;

  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("aimunim_reminder_rules")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("offset_days");

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Business profile, invoice themes, printing, aur reminders."
      />

      <Tabs defaultValue="business">
        <TabsList className="mb-2 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto sm:w-auto [&>*]:shrink-0">
          <TabsTrigger value="business">Manage Business</TabsTrigger>
          <TabsTrigger value="invoice">Invoice Settings</TabsTrigger>
          <TabsTrigger value="print">Print & Share</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <SettingsForm tenant={tenant} />
          <BusinessExtrasForm
            tenant={{
              pan: tenant?.pan ?? null,
              upi_id: tenant?.upi_id ?? null,
              business_type: tenant?.business_type ?? null,
              industry_type: tenant?.industry_type ?? null,
              registration_type: tenant?.registration_type ?? null,
              gst_registered: tenant?.gst_registered ?? true,
              tds_enabled: tenant?.tds_enabled ?? false,
              tcs_enabled: tenant?.tcs_enabled ?? false,
              default_terms: tenant?.default_terms ?? null,
              logo_path: tenant?.logo_path ?? null,
              signature_path: tenant?.signature_path ?? null,
            }}
          />
        </TabsContent>

        <TabsContent value="invoice">
          <InvoiceSettingsForm
            settings={invoiceSettings}
            customUnits={tenant?.custom_units ?? []}
          />
        </TabsContent>

        <TabsContent value="print">
          <PreferencesForm
            initialPaper={printSettings.paper ?? "A4"}
            initialChannel={tenant?.notification_channel ?? "whatsapp"}
            initialStoreEnabled={tenant?.store_enabled ?? false}
            initialStoreSlug={tenant?.store_slug ?? ""}
          />
        </TabsContent>

        <TabsContent value="reminders">
          <RemindersForm settings={invoiceSettings} rules={rules ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
