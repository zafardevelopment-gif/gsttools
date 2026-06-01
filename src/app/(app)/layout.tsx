import Link from "next/link";
import { FileText } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
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
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center gap-2 sm:gap-3">
          <MobileNav />
          <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="size-4" />
            </span>
            <span className="hidden sm:inline">GST Billing</span>
          </Link>
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
