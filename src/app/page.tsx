import Link from "next/link";
import {
  FileText,
  Warehouse,
  Users,
  Landmark,
  MonitorSmartphone,
  MessageCircle,
  BarChart3,
  RefreshCw,
  UserCheck,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PricingSection } from "@/components/marketing/pricing-section";

const FEATURES = [
  {
    icon: FileText,
    title: "GST invoicing",
    description:
      "Invoices, quotations, delivery challans, credit & debit notes with automatic CGST/SGST/IGST split.",
  },
  {
    icon: Warehouse,
    title: "Inventory & godowns",
    description:
      "Track stock across multiple warehouses with live quantities as you bill and receive stock.",
  },
  {
    icon: Users,
    title: "Parties ledger",
    description:
      "Customers and suppliers with running balances, outstanding dues and full transaction history.",
  },
  {
    icon: Landmark,
    title: "Payments & cash-bank",
    description:
      "Record payments in and out, and reconcile your cash and bank accounts against your ledger.",
  },
  {
    icon: MonitorSmartphone,
    title: "POS billing",
    description:
      "A fast counter-sale screen for retail and walk-in customers, built for speed on any device.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp sharing",
    description:
      "Send invoice PDFs and payment reminders straight to your customer's WhatsApp in one tap.",
  },
  {
    icon: RefreshCw,
    title: "Recurring bills",
    description:
      "Automate invoices for repeat customers and subscriptions so nothing gets missed.",
  },
  {
    icon: BarChart3,
    title: "Reports & insights",
    description:
      "Sales, GST, stock and expense reports that tell you where your business actually stands.",
  },
  {
    icon: UserCheck,
    title: "Staff & permissions",
    description:
      "Add team members with role-based access so staff see only what they need to.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Set up your business",
    description:
      "Add your GSTIN, business details and invoice theme — takes under two minutes.",
  },
  {
    step: "02",
    title: "Add parties & items",
    description:
      "Import or add your customers, suppliers and product catalog with GST rates and units.",
  },
  {
    step: "03",
    title: "Bill, share, get paid",
    description:
      "Create invoices, share them on WhatsApp, and track payments as they come in.",
  },
];

const FAQS = [
  {
    q: "Is AI Munim GST compliant?",
    a: "Yes. AI Munim automatically calculates CGST, SGST and IGST based on your business state and your customer's state, and generates GST-ready invoices for all standard GST rate slabs.",
  },
  {
    q: "Do I need to install any software?",
    a: "No. AI Munim runs entirely in your browser and works on desktop and mobile, so you can bill from a laptop at the counter or a phone on the go.",
  },
  {
    q: "Can I share invoices on WhatsApp?",
    a: "Yes. Every invoice can be shared as a PDF directly to WhatsApp, along with payment reminders for outstanding dues.",
  },
  {
    q: "What happens after my 14-day free trial?",
    a: "Your data stays exactly as you left it. Pick a plan that fits your business to keep creating invoices — no surprise charges, no auto-billing without your say-so.",
  },
  {
    q: "Can more than one person use the same account?",
    a: "Yes. Paid plans let you add staff members with role-based permissions, so your team can bill and manage stock without seeing everything.",
  },
  {
    q: "Is my business data secure?",
    a: "Your data is encrypted in transit and at rest, isolated per business, and only accessible to your team.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,var(--color-accent),transparent)]"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:py-28">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                AI Munim SaaS · Built for Indian businesses
              </span>
              <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.25rem]">
                Billing &amp; GST, made simple for Indian businesses
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
                Create GST invoices, track stock, manage customers &amp;
                suppliers, record payments, and see your business reports —
                all in one place.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-11 px-5 text-base">
                  <Link href="/signup">
                    Get started — 14-day free trial
                    <ArrowRight />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-11 px-5 text-base"
                >
                  <Link href="/login">Log in</Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                  CGST/SGST/IGST auto-calc
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
                  WhatsApp share
                </span>
                <span className="flex items-center gap-1.5">
                  <Smartphone className="size-4 text-emerald-600 dark:text-emerald-400" />
                  Works on mobile &amp; desktop
                </span>
              </div>
            </div>

            {/* Illustrative invoice preview */}
            <div className="relative mx-auto w-full max-w-md lg:mx-0">
              <div
                aria-hidden
                className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/15 via-transparent to-emerald-500/15 blur-2xl"
              />
              <div className="rounded-2xl border bg-card p-5 shadow-xl shadow-primary/5 ring-1 ring-foreground/10">
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/ai-munim.svg"
                      alt=""
                      className="size-8 rounded-lg"
                    />
                    <div>
                      <p className="text-sm font-semibold">Sharma Traders</p>
                      <p className="text-xs text-muted-foreground">
                        GSTIN 09ABCDE1234F1Z5
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">Tax Invoice</Badge>
                </div>

                <div className="mt-4 space-y-2.5">
                  {[
                    { name: "Cotton Fabric — 50m", amount: "₹18,000" },
                    { name: "Stitching Charges", amount: "₹3,500" },
                    { name: "Packing Material", amount: "₹850" },
                  ].map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {row.name}
                      </span>
                      <span className="font-medium">{row.amount}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-1.5 border-t pt-4 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Percent className="size-3.5" /> CGST + SGST (18%)
                    </span>
                    <span>₹4,023</span>
                  </div>
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span>Total due</span>
                    <span>₹26,373</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <MessageCircle className="size-3.5" />
                  Sent to customer on WhatsApp
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything your business needs to bill and grow
            </h2>
            <p className="mt-3 text-muted-foreground">
              One tool for invoicing, stock, ledgers and reports — no
              spreadsheets, no separate apps.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border bg-card p-6 ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Up and running in three steps
              </h2>
              <p className="mt-3 text-muted-foreground">
                No accountant needed to get started.
              </p>
            </div>

            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <div key={s.step} className="relative">
                  <div className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    {s.step}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {s.description}
                  </p>
                  {i < STEPS.length - 1 && (
                    <div
                      aria-hidden
                      className="absolute top-5 left-[calc(100%+1rem)] hidden h-px w-[calc(100%-2rem)] bg-border sm:block"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <PricingSection id="pricing" />

        {/* FAQ */}
        <section id="faq" className="border-t bg-muted/30">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Frequently asked questions
              </h2>
            </div>

            <div className="mt-10 divide-y rounded-2xl border bg-card ring-1 ring-foreground/10">
              {FAQS.map((item) => (
                <details key={item.q} className="group p-5 open:pb-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {item.q}
                    <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(255,255,255,0.15),transparent)]"
            />
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Start billing the simple way
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-primary-foreground/85">
              14-day free trial. No credit card required. Cancel anytime.
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="mt-8 h-11 px-6 text-base"
            >
              <Link href="/signup">
                Get started for free
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
