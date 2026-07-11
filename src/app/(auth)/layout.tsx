import Link from "next/link";

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
        className="mb-8 flex flex-col items-center gap-2 text-xl font-bold tracking-tight"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ai-munim.svg" alt="AI Munim" className="size-14 rounded-2xl shadow-md" />
        <span>
          AI <span className="text-emerald-600 dark:text-emerald-400">Munim</span>
        </span>
      </Link>

      {children}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        WhatsApp pe business. AI pe bharosa.
      </p>
    </div>
  );
}
