import { PageHeader } from "@/components/page-header";
import { UpgradeButton } from "./upgrade-button";
import { getSubscription, getMonthlyInvoiceCount, planKeyOf } from "@/server/queries/subscription";
import { isSubscriptionActive, daysLeft, monthlyInvoiceLimit } from "@/lib/subscription";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { PLANS, type PlanKey } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Subscription · AI Munim" };

const ORDER: PlanKey[] = ["trial", "silver", "gold", "diamond"];

export default async function SubscriptionPage() {
  const sub = await getSubscription();
  const used = await getMonthlyInvoiceCount();
  const current = planKeyOf(sub);
  const active = sub ? isSubscriptionActive(sub) : true;
  const trialDays = sub?.status === "trialing" ? daysLeft(sub.trial_ends_at) : 0;
  const limit = monthlyInvoiceLimit(current);
  const razorpay = isRazorpayConfigured();

  return (
    <div>
      <PageHeader
        title="Subscription"
        description="Your plan, trial status and usage."
      />

      {!razorpay && (
        <p className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
          Razorpay isn&apos;t configured — plan changes here are a demo and take
          effect immediately. Wire real keys to charge customers.
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Current plan</p>
            <p className="text-2xl font-bold capitalize">{PLANS[current].name}</p>
            <Badge variant={active ? "default" : "destructive"} className="mt-1">
              {sub?.status ?? "trialing"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Trial</p>
            <p className="text-2xl font-bold">
              {sub?.status === "trialing" ? `${trialDays} days left` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Invoices this month</p>
            <p className="text-2xl font-bold">
              {used}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {limit === Infinity ? "∞" : limit}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {ORDER.map((key) => {
          const plan = PLANS[key];
          return (
            <Card key={key} className={key === current ? "border-primary" : ""}>
              <CardContent className="flex h-full flex-col gap-3 pt-6">
                <div>
                  <p className="text-lg font-semibold">{plan.name}</p>
                  <p className="text-2xl font-bold">
                    {plan.pricePaise === 0 ? "Free" : formatINR(plan.pricePaise)}
                    {plan.pricePaise > 0 && (
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    )}
                  </p>
                </div>
                <ul className="flex-1 space-y-1 text-sm text-muted-foreground">
                  <li>
                    {plan.limits.invoicesPerMonth === Infinity
                      ? "Unlimited invoices"
                      : `${plan.limits.invoicesPerMonth} invoices / month`}
                  </li>
                  <li>
                    {plan.limits.users === Infinity
                      ? "Unlimited users"
                      : `${plan.limits.users} user(s)`}
                  </li>
                  <li>
                    {plan.limits.items === Infinity
                      ? "Unlimited items"
                      : `${plan.limits.items} items`}
                  </li>
                  {key === "trial" && <li>14-day free trial</li>}
                </ul>
                <UpgradeButton
                  plan={key}
                  current={key === current}
                  razorpayConfigured={razorpay}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
