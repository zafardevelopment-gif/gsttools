"use client";

import { refreshWithRetry } from "@/lib/refresh-with-retry";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { toast } from "sonner";
import { setActiveTenantAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TenantOption = { tenantId: string; name: string };

export function TenantSwitcher({
  tenants,
  activeTenantId,
}: {
  tenants: TenantOption[];
  activeTenantId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = tenants.find((t) => t.tenantId === activeTenantId);

  function switchTo(id: string) {
    if (id === activeTenantId) return;
    startTransition(async () => {
      try {
        await setActiveTenantAction(id);
        refreshWithRetry(router);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not switch.");
      }
    });
  }

  if (tenants.length <= 1) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium">
        <Building2 className="size-4 text-muted-foreground" />
        {active?.name ?? "My Business"}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} className="gap-2">
          <Building2 className="size-4" />
          <span className="max-w-[12rem] truncate">{active?.name ?? "Select"}</span>
          <ChevronsUpDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {tenants.map((t) => (
          <DropdownMenuItem
            key={t.tenantId}
            onClick={() => switchTo(t.tenantId)}
            className="gap-2"
          >
            <Check
              className={
                t.tenantId === activeTenantId ? "size-4" : "size-4 opacity-0"
              }
            />
            <span className="truncate">{t.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
