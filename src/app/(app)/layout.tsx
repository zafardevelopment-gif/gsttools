import { Sidebar } from "@/components/layout/sidebar";
import { TenantSwitcher } from "@/components/layout/tenant-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { getAppContext } from "@/server/queries/app-context";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAppContext();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-tight">GST Billing</span>
          <TenantSwitcher tenants={ctx.tenants} activeTenantId={ctx.tenantId} />
        </div>
        <UserMenu label={ctx.userLabel} />
      </header>
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-x-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
