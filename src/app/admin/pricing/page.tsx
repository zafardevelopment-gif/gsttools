import { PLANS } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Pricing · Super Admin · AI Munim" };

/**
 * Read-only view of the plan catalog. PLANS lives in src/lib/constants.ts,
 * not a DB table — the DB check constraints on aimunim_tenants.plan /
 * aimunim_subscriptions.plan only allow trial/silver/gold/diamond today (see
 * server/actions/super-admin.ts), so platinum/enterprise below are shown as
 * marketing-only tiers. Editing a plan means editing that file and shipping
 * a deploy, not a form here.
 */
export default function AdminPricingPage() {
  const plans = Object.values(PLANS);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The plan catalog every tenant subscribes from. Defined in code
          (src/lib/constants.ts) — read-only here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const assignable = ["trial", "silver", "gold", "diamond"].includes(
            plan.key,
          );
          return (
            <div
              key={plan.key}
              className="rounded-xl border bg-card p-5 ring-1 ring-foreground/10"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold">{plan.name}</h2>
                {!assignable && (
                  <Badge variant="outline" className="shrink-0">
                    Marketing only
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {plan.pricePaise === 0 ? "Free" : formatINR(plan.pricePaise)}
                {plan.pricePaise > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / mo
                  </span>
                )}
              </p>
              {plan.trialDays > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.trialDays}-day trial
                </p>
              )}
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Invoices / month</dt>
                  <dd className="font-medium tabular-nums">
                    {plan.limits.invoicesPerMonth === Infinity
                      ? "Unlimited"
                      : plan.limits.invoicesPerMonth}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Users</dt>
                  <dd className="font-medium tabular-nums">
                    {plan.limits.users === Infinity
                      ? "Unlimited"
                      : plan.limits.users}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Items</dt>
                  <dd className="font-medium tabular-nums">
                    {plan.limits.items === Infinity
                      ? "Unlimited"
                      : plan.limits.items}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
