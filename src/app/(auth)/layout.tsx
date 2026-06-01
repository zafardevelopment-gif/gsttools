import Link from "next/link";
import { FileText } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-12">
      {/* Soft brand backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_40%_at_50%_0%,var(--color-accent),transparent)]"
      />

      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <FileText className="size-5" />
        </span>
        GST Billing
      </Link>

      {children}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Simple GST billing &amp; accounting for Indian businesses.
      </p>
    </div>
  );
}
