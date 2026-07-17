import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, type PlanKey } from "@/lib/constants";
import { cn } from "@/lib/utils";

type PlanCardConfig = {
  key: Exclude<PlanKey, "trial">;
  tagline: string;
  highlight?: boolean;
  features: string[];
};

const PLAN_CARDS: PlanCardConfig[] = [
  {
    key: "silver",
    tagline: "For a single shop just getting started with GST billing.",
    features: [
      "Up to 500 invoices/month",
      "2 team members",
      "Up to 1,000 items",
      "Parties ledger & payments",
      "WhatsApp invoice sharing",
    ],
  },
  {
    key: "gold",
    tagline: "For growing businesses with more staff and stock.",
    highlight: true,
    features: [
      "Up to 5,000 invoices/month",
      "5 team members",
      "Up to 10,000 items",
      "POS billing & multiple godowns",
      "Recurring & automated bills",
    ],
  },
  {
    key: "diamond",
    tagline: "For high-volume billing across a small team.",
    features: [
      "Unlimited invoices",
      "Unlimited items",
      "2 team members",
      "Advanced reports & Tally export",
      "WhatsApp invoice sharing",
    ],
  },
  {
    key: "platinum",
    tagline: "For multi-location businesses with larger teams.",
    features: [
      "Unlimited invoices",
      "Unlimited items",
      "4 team members",
      "Advanced reports & Tally export",
      "Role-based staff permissions",
    ],
  },
];

function formatLimit(n: number): string {
  return n === Infinity ? "Unlimited" : n.toLocaleString("en-IN");
}

export function PricingSection({
  id,
  showHeading = true,
}: {
  id?: string;
  showHeading?: boolean;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      {showHeading && (
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-muted-foreground">
            Start with a 14-day free trial — no card required. Upgrade
            whenever your business needs more.
          </p>
        </div>
      )}

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_CARDS.map((card) => {
          const plan = PLANS[card.key];
          const rupees = plan.pricePaise / 100;
          return (
            <div
              key={card.key}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6 ring-1 ring-foreground/10",
                card.highlight && "border-primary shadow-lg shadow-primary/10",
              )}
            >
              {card.highlight && (
                <Badge className="absolute -top-3 left-6">Most popular</Badge>
              )}
              <p className="text-sm font-semibold text-muted-foreground">
                {plan.name}
              </p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">
                  ₹{rupees.toLocaleString("en-IN")}
                </span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {card.tagline}
              </p>

              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {card.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className="mt-6"
                variant={card.highlight ? "default" : "outline"}
              >
                <Link href="/signup">Start free trial</Link>
              </Button>

              <p className="mt-3 text-center text-xs text-muted-foreground">
                {formatLimit(plan.limits.invoicesPerMonth)} invoices/month
              </p>
            </div>
          );
        })}
      </div>

      <div className="mx-auto mt-8 max-w-2xl rounded-xl border bg-muted/40 p-5 text-center text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Need a custom plan?</span>{" "}
        Enterprise plans with unlimited users, items and invoices start at
        ₹{(PLANS.enterprise.pricePaise / 100).toLocaleString("en-IN")}/month —
        reach out after signing up and we&apos;ll set it up for your team.
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        All prices are per month and exclude applicable taxes.
      </p>
    </section>
  );
}
