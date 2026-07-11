import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type SetupStep = {
  key: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
};

/**
 * First-run onboarding checklist shown next to the dashboard until every step
 * is complete. Each pending step deep-links to the page where it's done.
 */
export function SetupGuide({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <Card className="relative mb-6 overflow-hidden border-primary/25">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-primary/10 blur-2xl"
      />
      <CardContent className="pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="size-4" />
            </span>
            <div>
              <p className="font-semibold">Setup guide</p>
              <p className="text-xs text-muted-foreground">
                Bas {steps.length - done} step baaki — phir aap billing ke liye poori tarah ready!
              </p>
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums text-primary">
            {done}/{steps.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all"
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s) =>
            s.done ? (
              <div
                key={s.key}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                <span className="line-through">{s.label}</span>
              </div>
            ) : (
              <Link
                key={s.key}
                href={s.href}
                className="group flex items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] px-2.5 py-2 text-sm transition-colors hover:border-primary/60 hover:bg-primary/[0.07]"
              >
                <Circle className="size-4 shrink-0 text-primary/50" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.hint}
                  </span>
                </span>
                <ArrowRight className="ml-auto size-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}
