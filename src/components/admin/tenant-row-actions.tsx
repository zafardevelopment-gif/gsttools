"use client";

import { useState, useTransition } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateTenantPlanAction,
  updateSubscriptionStatusAction,
  viewAsTenantAction,
  type DbPlanKey,
  type DbStatusKey,
} from "@/server/actions/super-admin";

const PLAN_OPTIONS: { value: DbPlanKey; label: string }[] = [
  { value: "trial", label: "Trial" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "diamond", label: "Diamond" },
];

const STATUS_OPTIONS: { value: DbStatusKey; label: string }[] = [
  { value: "trialing", label: "Trialing" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled (suspended)" },
  { value: "expired", label: "Expired" },
];

export function TenantRowActions({
  tenantId,
  plan,
  status,
}: {
  tenantId: string;
  plan: DbPlanKey;
  status: DbStatusKey | null;
}) {
  const [pendingAction, startTransition] = useTransition();
  const [viewPending, startViewTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handlePlanChange(value: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateTenantPlanAction(tenantId, value as DbPlanKey);
      if (res?.error) setError(res.error);
    });
  }

  function handleStatusChange(value: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateSubscriptionStatusAction(
        tenantId,
        value as DbStatusKey,
      );
      if (res?.error) setError(res.error);
    });
  }

  function handleViewAs() {
    setError(null);
    startViewTransition(async () => {
      await viewAsTenantAction(tenantId);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={plan} onValueChange={handlePlanChange} disabled={pendingAction}>
        <SelectTrigger size="sm" className="w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLAN_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status ?? "trialing"}
        onValueChange={handleStatusChange}
        disabled={pendingAction}
      >
        <SelectTrigger size="sm" className="w-[168px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleViewAs}
        disabled={viewPending}
      >
        {viewPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Eye className="size-3.5" />
        )}
        View as
      </Button>

      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
