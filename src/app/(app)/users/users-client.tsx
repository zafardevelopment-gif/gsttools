"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import {
  inviteUserAction,
  createUserAction,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
  const [inviteRole, setInviteRole] = useState<RoleKey>("staff");
  const [createRole, setCreateRole] = useState<RoleKey>("staff");

  function onInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await inviteUserAction({
        email: String(fd.get("email") ?? ""),
        role: inviteRole,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Member added.");
        setOpen(false);
        router.refresh();
      }
    });
  }

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createUserAction({
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        role: createRole,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Account created and added.");
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
        <Tabs defaultValue="create">
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1">New account</TabsTrigger>
            <TabsTrigger value="invite" className="flex-1">Invite existing</TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="create_email">Email</Label>
                <Input
                  id="create_email"
                  name="email"
                  type="email"
                  placeholder="teammate@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create_password">Password</Label>
                <Input
                  id="create_password"
                  name="password"
                  type="text"
                  placeholder="Set a temporary password"
                  minLength={6}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Share this with them — they can change it after logging in.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={createRole} onValueChange={(v) => setCreateRole(v as RoleKey)}>
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
                  {pending ? "Creating…" : "Create & add"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="invite">
            <form onSubmit={onInvite} className="space-y-4">
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
                  The person must already have an account.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as RoleKey)}>
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
          </TabsContent>
        </Tabs>
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
