"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, IndianRupee, FileText } from "lucide-react";
import {
  createStaffAction,
  markAttendanceAction,
  addStaffLedgerAction,
  generatePayslipAction,
} from "@/server/actions/staff";
import { formatINR } from "@/lib/money";
import type { StaffListRow } from "@/server/queries/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

const ATT_STATUSES = [
  { key: "present", label: "P", title: "Present" },
  { key: "half_day", label: "½", title: "Half day" },
  { key: "overtime", label: "OT", title: "Overtime" },
  { key: "absent", label: "A", title: "Absent" },
] as const;

export function AddStaffDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createStaffAction({
        name: String(fd.get("name") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        designation: String(fd.get("designation") ?? ""),
        basicSalary: Number(fd.get("basic") ?? 0),
        hra: Number(fd.get("hra") ?? 0),
        conveyance: Number(fd.get("conveyance") ?? 0),
        joinedOn: String(fd.get("joined_on") ?? "") || undefined,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Staff member added.");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Add staff
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff member</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="st_name">Name</Label>
              <Input id="st_name" name="name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st_phone">Phone</Label>
              <Input id="st_phone" name="phone" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="st_desig">Designation</Label>
              <Input id="st_desig" name="designation" placeholder="Salesman" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st_joined">Joined on</Label>
              <Input id="st_joined" name="joined_on" type="date" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="st_basic">Basic (₹/mo)</Label>
              <Input id="st_basic" name="basic" type="number" step="1" min="0" defaultValue="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st_hra">HRA (₹/mo)</Label>
              <Input id="st_hra" name="hra" type="number" step="1" min="0" defaultValue="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st_conv">Conveyance</Label>
              <Input id="st_conv" name="conveyance" type="number" step="1" min="0" defaultValue="0" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add staff"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceButtons({ staff }: { staff: StaffListRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function mark(status: (typeof ATT_STATUSES)[number]["key"]) {
    startTransition(async () => {
      const res = await markAttendanceAction({
        staffId: staff.id,
        day: today(),
        status,
        overtimeHours: status === "overtime" ? 2 : 0,
      });
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex gap-1">
      {ATT_STATUSES.map((s) => (
        <button
          key={s.key}
          type="button"
          title={s.title}
          disabled={pending}
          onClick={() => mark(s.key)}
          className={`size-8 rounded-md border text-xs font-semibold transition-colors ${
            staff.today_status === s.key
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function StaffActions({ staff }: { staff: StaffListRow }) {
  const router = useRouter();
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"advance" | "loan" | "deduction" | "repayment">("advance");

  function onLedgerSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addStaffLedgerAction({
        staffId: staff.id,
        kind,
        amount: Number(fd.get("amount") ?? 0),
        entryDate: String(fd.get("entry_date") ?? today()),
        notes: String(fd.get("notes") ?? ""),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Entry recorded.");
        setLedgerOpen(false);
        router.refresh();
      }
    });
  }

  function payslip() {
    startTransition(async () => {
      const res = await generatePayslipAction({ staffId: staff.id, month: thisMonth() });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Payslip generated for this month.");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex gap-1.5">
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" title="Advance / loan / deduction">
            <IndianRupee className="size-3.5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{staff.name} — advance / loan</DialogTitle>
          </DialogHeader>
          <form onSubmit={onLedgerSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advance">Advance</SelectItem>
                    <SelectItem value="loan">Loan</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                    <SelectItem value="repayment">Repayment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`amt_${staff.id}`}>Amount (₹)</Label>
                <Input id={`amt_${staff.id}`} name="amount" type="number" step="0.01" min="0" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`dt_${staff.id}`}>Date</Label>
              <Input id={`dt_${staff.id}`} name="entry_date" type="date" defaultValue={today()} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`nt_${staff.id}`}>Notes</Label>
              <Input id={`nt_${staff.id}`} name="notes" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Button
        variant="outline"
        size="sm"
        onClick={payslip}
        disabled={pending}
        title="Generate this month's payslip"
      >
        <FileText className="size-3.5" />
      </Button>
    </div>
  );
}

export function StaffList({ staff }: { staff: StaffListRow[] }) {
  if (staff.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No staff yet. Add your first staff member.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {staff.map((s) => {
        const monthly = s.basic_salary_paise + s.hra_paise + s.conveyance_paise;
        return (
          <Card key={s.id}>
            <CardContent className="flex flex-col gap-3 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {s.designation ?? "Staff"}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">{formatINR(monthly)}/mo</p>
                  {s.advance_balance_paise > 0 && (
                    <Badge variant="destructive" className="mt-1">
                      Advance due {formatINR(s.advance_balance_paise)}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Today:</span>
                  <AttendanceButtons staff={s} />
                </div>
                <StaffActions staff={s} />
              </div>
              {s.latest_payslip && (
                <p className="text-xs text-muted-foreground">
                  Last payslip {s.latest_payslip.month.slice(0, 7)}: net{" "}
                  <span className="font-medium text-foreground">
                    {formatINR(s.latest_payslip.net_paise)}
                  </span>{" "}
                  ({s.latest_payslip.days_present}/{s.latest_payslip.days_in_month} days)
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
