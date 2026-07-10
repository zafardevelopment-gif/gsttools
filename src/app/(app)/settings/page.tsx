import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";
import { PreferencesForm } from "./preferences-form";
import { getAppContext } from "@/server/queries/app-context";

export const metadata = { title: "Settings · GST Billing" };

export default async function SettingsPage() {
  const ctx = await getAppContext();
  const printSettings = (ctx.activeTenant?.print_settings ?? {}) as { paper?: string };
  return (
    <div>
      <PageHeader
        title="Business settings"
        description="Update your business profile used on invoices."
      />
      <SettingsForm tenant={ctx.activeTenant} />
      <PreferencesForm
        initialPaper={printSettings.paper ?? "A4"}
        initialChannel={ctx.activeTenant?.notification_channel ?? "whatsapp"}
        initialStoreEnabled={ctx.activeTenant?.store_enabled ?? false}
        initialStoreSlug={ctx.activeTenant?.store_slug ?? ""}
      />
    </div>
  );
}
