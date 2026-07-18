"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { refreshWithRetry } from "@/lib/refresh-with-retry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDelete } from "@/components/confirm-delete";
import {
  updateMembershipRoleAction,
  deleteUserAction,
  type MembershipRoleKey,
} from "@/server/actions/super-admin";

const ROLE_OPTIONS: { value: MembershipRoleKey; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "partner", label: "Partner" },
  { value: "ca", label: "CA" },
  { value: "salesman", label: "Salesman" },
  { value: "stock_manager", label: "Stock manager" },
  { value: "delivery_boy", label: "Delivery boy" },
  { value: "staff", label: "Staff" },
];

/** Role select + delete-account controls for a row on the platform Users page. */
export function UserRowActions({
  membershipId,
  userId,
  role,
  email,
}: {
  membershipId: string;
  userId: string;
  role: MembershipRoleKey;
  email: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRoleChange(value: string) {
    startTransition(async () => {
      const res = await updateMembershipRoleAction(
        membershipId,
        value as MembershipRoleKey,
      );
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Role updated.");
        refreshWithRetry(router);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={handleRoleChange} disabled={pending}>
        <SelectTrigger size="sm" className="w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ConfirmDelete
        title="Delete this user?"
        description={`This permanently deletes ${email}'s account and removes them from every business they're a member of. This cannot be undone.`}
        onConfirm={() => deleteUserAction(userId)}
      />
    </div>
  );
}
