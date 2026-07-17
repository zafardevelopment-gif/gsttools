import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TenantSwitcher } from "@/components/layout/tenant-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAppContext } from "@/server/queries/app-context";
import { exitImpersonationAction } from "@/server/actions/super-admin";
import { ShieldCheck } from "lucide-react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAppContext();

  return (
    <div className="flex flex-1 flex-col">
      {ctx.impersonating && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-amber-950 print:hidden">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Viewing <strong>{ctx.activeTenant?.name ?? "this business"}</strong> as Super Admin
          </span>
          <form action={exitImpersonationAction}>
            <button type="submit" className="underline underline-offset-2 hover:no-underline">
              Exit to admin panel
            </button>
          </form>
        </div>
      )}
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
          {!ctx.impersonating && (
            <TenantSwitcher tenants={ctx.tenants} activeTenantId={ctx.tenantId} />
          )}
        </div>
        <div className="flex items-center gap-1">
          {!ctx.impersonating && ctx.isSuperAdmin && (
            <Link
              href="/admin"
              className="mr-1 flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-400"
            >
              <ShieldCheck className="size-3.5" /> Super Admin
            </Link>
          )}
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
