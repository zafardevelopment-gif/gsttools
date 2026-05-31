import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";
import { getAppContext } from "@/server/queries/app-context";

export const metadata = { title: "Settings · GST Billing" };

export default async function SettingsPage() {
  const ctx = await getAppContext();
  return (
    <div>
      <PageHeader
        title="Business settings"
        description="Update your business profile used on invoices."
      />
      <SettingsForm tenant={ctx.activeTenant} />
    </div>
  );
}
