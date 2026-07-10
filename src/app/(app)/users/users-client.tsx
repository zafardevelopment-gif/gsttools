"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import {
  inviteUserAction,
  changeRoleAction,
  removeMemberAction,
} from "@/server/actions/users";
import type { MemberRow } from "@/server/queries/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const ROLES = [
  { key: "owner", label: "Owner" },
  { key: "admin", label: "Admin" },
  { key: "partner", label: "Partner" },
  { key: "ca", label: "CA (Accountant)" },
  { key: "salesman", label: "Salesman" },
  { key: "stock_manager", label: "Stock Manager" },
  { key: "delivery_boy", label: "Delivery Boy" },
  { key: "staff", label: "Staff" },
] as const;

type RoleKey = (typeof ROLES)[number]["key"];

export function InviteUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<RoleKey>("staff");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await inviteUserAction({
        email: String(fd.get("email") ?? ""),
        role,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Member added.");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv_email">Email</Label>
            <Input
              id="inv_email"
              name="email"
              type="email"
              placeholder="teammate@example.com"
              required
            />
            <p className="text-xs text-muted-foreground">
              The person must already have an account (sign up / SQL user script).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as RoleKey)}>
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
              {pending ? "Adding…" : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MembersTable({ members }: { members: MemberRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setRole(membershipId: string, role: RoleKey) {
    startTransition(async () => {
      const res = await changeRoleAction({ membershipId, role });
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  function remove(membershipId: string) {
    startTransition(async () => {
      const res = await removeMemberAction(membershipId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Member removed.");
        router.refresh();
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Since</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.email ?? m.user_id}</TableCell>
              <TableCell>
                <Select
                  value={m.role}
                  onValueChange={(v) => setRole(m.id, v as RoleKey)}
                  disabled={pending}
                >
                  <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {m.created_at.slice(0, 10)}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  onClick={() => remove(m.id)}
                  disabled={pending}
                  title="Remove member"
                >
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
