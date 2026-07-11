import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="space-y-4 max-w-2xl">
        <span className="inline-block rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          AI Munim SaaS · MVP
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Billing &amp; GST, made simple for Indian businesses
        </h1>
        <p className="text-lg text-muted-foreground">
          Create GST invoices, track stock, manage customers &amp; suppliers,
          record payments, and see your business reports — all in one place.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/login">Get started — 14-day free trial</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Phone OTP login · CGST/SGST/IGST auto-calc · WhatsApp share
      </p>
    </main>
  );
}
