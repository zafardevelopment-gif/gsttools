import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PricingSection } from "@/components/marketing/pricing-section";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PLANS, type PlanKey } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Pricing — AI Munim",
  description:
    "Simple, transparent pricing for GST invoicing, inventory and reports. Start with a 14-day free trial, no card required.",
};

const COMPARE_PLANS: Exclude<PlanKey, "trial">[] = [
  "silver",
  "gold",
  "diamond",
  "platinum",
  "enterprise",
];

function formatLimit(n: number): string {
  return n === Infinity ? "Unlimited" : n.toLocaleString("en-IN");
}

const BILLING_FAQS = [
  {
    q: "How does the 14-day free trial work?",
    a: "Every new business gets full access for 14 days — no credit card required to start. You can create up to 50 invoices during the trial.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. You can move up or down a plan as your invoice volume, item catalog or team size changes.",
  },
  {
    q: "What counts towards the invoice limit?",
    a: "Each GST or non-GST invoice you create in a calendar month counts towards your plan's limit. Quotations, delivery challans and other non-billing vouchers don't count.",
  },
  {
    q: "Do prices include GST?",
    a: "Listed prices are per month and exclude applicable taxes, which are added at checkout.",
  },
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_45%_at_50%_0%,var(--color-accent),transparent)]"
          />
          <div className="mx-auto max-w-3xl px-4 pt-16 pb-4 text-center sm:px-6 sm:pt-24">
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              Pricing that grows with your business
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground text-pretty">
              Start free for 14 days. Every plan includes GST invoicing,
              inventory, parties and WhatsApp sharing — pick the one that
              matches your invoice volume and team size.
            </p>
          </div>
        </section>

        <PricingSection showHeading={false} />

        {/* Comparison table */}
        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Compare plan limits
              </h2>
              <p className="mt-3 text-muted-foreground">
                Every plan includes the same features — plans differ by how
                much your business bills.
              </p>
            </div>

            <div className="mt-10 overflow-hidden rounded-2xl border bg-card ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Invoices / month</TableHead>
                    <TableHead>Team members</TableHead>
                    <TableHead>Items</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COMPARE_PLANS.map((key) => {
                    const plan = PLANS[key];
                    const rupees = plan.pricePaise / 100;
                    return (
                      <TableRow key={key}>
                        <TableCell className="font-medium">
                          {plan.name}
                        </TableCell>
                        <TableCell>
                          {key === "enterprise"
                            ? `From ₹${rupees.toLocaleString("en-IN")}/mo`
                            : `₹${rupees.toLocaleString("en-IN")}/mo`}
                        </TableCell>
                        <TableCell>
                          {formatLimit(plan.limits.invoicesPerMonth)}
                        </TableCell>
                        <TableCell>
                          {formatLimit(plan.limits.users)}
                        </TableCell>
                        <TableCell>
                          {formatLimit(plan.limits.items)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

        {/* Billing FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Billing questions
          </h2>
          <div className="mt-10 divide-y rounded-2xl border bg-card ring-1 ring-foreground/10">
            {BILLING_FAQS.map((item) => (
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
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(255,255,255,0.15),transparent)]"
            />
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Try AI Munim free for 14 days
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-primary-foreground/85">
              No credit card required. Cancel anytime.
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="mt-8 h-11 px-6 text-base"
            >
              <Link href="/login">
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
