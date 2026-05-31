"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changePlanAction } from "@/server/actions/subscription";
import type { PlanKey } from "@/lib/constants";
import { Button } from "@/components/ui/button";

export function UpgradeButton({
  plan,
  current,
  razorpayConfigured,
}: {
  plan: PlanKey;
  current: boolean;
  razorpayConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (current) {
    return (
      <Button variant="outline" disabled className="w-full">
        Current plan
      </Button>
    );
  }

  function choose() {
    startTransition(async () => {
      const res = await changePlanAction(plan);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Plan updated.");
        router.refresh();
      }
    });
  }

  return (
    <Button className="w-full" onClick={choose} disabled={pending}>
      {pending
        ? "Updating…"
        : razorpayConfigured
          ? "Choose plan"
          : "Choose plan (demo)"}
    </Button>
  );
}
