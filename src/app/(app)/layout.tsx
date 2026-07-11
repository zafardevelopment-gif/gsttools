import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TenantSwitcher } from "@/components/layout/tenant-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAppContext } from "@/server/queries/app-context";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAppContext();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 px-4 shadow-[0_1px_3px_0_oklch(0.2_0.02_277/0.04)] backdrop-blur-md print:hidden">
        <div className="flex items-center gap-2 sm:gap-3">
          <MobileNav />
          <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ai-munim.svg"
              alt="AI Munim"
              className="size-8 rounded-xl shadow-sm"
            />
            <span className="hidden sm:inline">
              AI <span className="text-emerald-600 dark:text-emerald-400">Munim</span>
            </span>
          </Link>
          <TenantSwitcher tenants={ctx.tenants} activeTenantId={ctx.tenantId} />
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu label={ctx.userLabel} />
        </div>
      </header>
      <div className="flex flex-1">
        <Sidebar role={ctx.role} />
        <main className="flex-1 overflow-x-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
