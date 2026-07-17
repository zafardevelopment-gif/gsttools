import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = { title: "Super Admin · AI Munim" };
export const dynamic = "force-dynamic";

/**
 * Dedicated shell for the platform-level super-admin panel — intentionally
 * separate from the (app) tenant shell. A super admin isn't a member of any
 * particular business, so this layout never shows a tenant name, sidebar or
 * tenant switcher; it only ever shows platform-wide views. Gated here (not
 * just per-page) so every current and future /admin/* route is covered.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!isSuperAdmin(user.email)) notFound();

  return (
    <div className="flex flex-1 flex-col bg-muted/20">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/admin"
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ai-munim.svg"
              alt="AI Munim"
              className="size-8 rounded-lg shadow-sm"
            />
            <span>
              AI <span className="text-emerald-600 dark:text-emerald-400">Munim</span>
            </span>
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
              <ShieldCheck className="size-3" /> Platform
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu label={user.email ?? "Super admin"} />
          </div>
        </div>
        <AdminNav />
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
