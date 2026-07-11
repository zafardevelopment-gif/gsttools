export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative mb-7 flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl border bg-gradient-to-r from-primary/[0.07] via-card to-card px-5 py-4 shadow-[0_1px_3px_0_oklch(0.2_0.02_277/0.05)]">
      {/* Decorative glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-12 size-36 rounded-full bg-primary/10 blur-2xl"
      />
      <div className="relative flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1 h-10 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-primary via-primary/70 to-primary/30"
        />
        <div>
          <h1 className="bg-gradient-to-r from-foreground via-foreground to-primary/80 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="relative">{action}</div>}
    </div>
  );
}
