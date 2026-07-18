"use client";

import { refreshWithRetry } from "@/lib/refresh-with-retry";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPlatformUserAction,
  type MembershipRoleKey,
} from "@/server/actions/super-admin";

const ROLES: { key: MembershipRoleKey; label: string }[] = [
  { key: "owner", label: "Owner" },
  { key: "admin", label: "Admin" },
  { key: "partner", label: "Partner" },
  { key: "ca", label: "CA (Accountant)" },
  { key: "salesman", label: "Salesman" },
  { key: "stock_manager", label: "Stock Manager" },
  { key: "delivery_boy", label: "Delivery Boy" },
  { key: "staff", label: "Staff" },
];

export function CreateUserDialog({
  tenants,
}: {
  tenants: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [role, setRole] = useState<MembershipRoleKey>("staff");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tenantId) {
      toast.error("Choose a business first.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createPlatformUserAction({
        tenantId,
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        role,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Account created and assigned.");
        setOpen(false);
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Create user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create a new user</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pu_email">Email</Label>
            <Input
              id="pu_email"
              name="email"
              type="email"
              placeholder="owner@business.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pu_password">Password</Label>
            <Input
              id="pu_password"
              name="password"
              type="text"
              placeholder="Set a temporary password"
              minLength={6}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Business</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger><SelectValue placeholder="Choose a tenant" /></SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as MembershipRoleKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create & assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
