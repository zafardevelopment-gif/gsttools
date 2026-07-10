"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { rupeesToPaise } from "@/lib/money";

export type ActionResult = { ok?: true; error?: string };

const staffSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  phone: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  /** Monthly salary components in rupees. */
  basicSalary: z.coerce.number().min(0).default(0),
  hra: z.coerce.number().min(0).default(0),
  conveyance: z.coerce.number().min(0).default(0),
  joinedOn: z.string().optional(),
});

export async function createStaffAction(
  input: z.input<typeof staffSchema>,
): Promise<ActionResult> {
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase.from("aimunim_staff").insert({
    tenant_id: tenantId,
    name: v.name,
    phone: v.phone || null,
    designation: v.designation || null,
    basic_salary_paise: rupeesToPaise(v.basicSalary),
    hra_paise: rupeesToPaise(v.hra),
    conveyance_paise: rupeesToPaise(v.conveyance),
    joined_on: v.joinedOn || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/staff");
  return { ok: true };
}

const attendanceSchema = z.object({
  staffId: z.string().uuid(),
  day: z.string().min(1),
  status: z.enum(["present", "absent", "half_day", "overtime"]),
  overtimeHours: z.coerce.number().min(0).default(0),
});

/** Upsert one day's attendance for a staff member. */
export async function markAttendanceAction(
  input: z.input<typeof attendanceSchema>,
): Promise<ActionResult> {
  const parsed = attendanceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("aimunim_attendance")
    .upsert(
      {
        tenant_id: tenantId,
        staff_id: v.staffId,
        day: v.day,
        status: v.status,
        overtime_hours: v.overtimeHours,
      },
      { onConflict: "staff_id,day" },
    );
  if (error) return { error: error.message };
  revalidatePath("/staff");
  return { ok: true };
}

const ledgerSchema = z.object({
  staffId: z.string().uuid(),
  kind: z.enum(["advance", "loan", "deduction", "repayment"]),
  amount: z.coerce.number().positive("Amount must be > 0."),
  entryDate: z.string().min(1),
  notes: z.string().trim().optional(),
});

/** Record an advance / loan / deduction / repayment for a staff member. */
export async function addStaffLedgerAction(
  input: z.input<typeof ledgerSchema>,
): Promise<ActionResult> {
  const parsed = ledgerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase.from("aimunim_staff_ledger").insert({
    tenant_id: tenantId,
    staff_id: v.staffId,
    kind: v.kind,
    amount_paise: rupeesToPaise(v.amount),
    entry_date: v.entryDate,
    notes: v.notes || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/staff");
  return { ok: true };
}

/**
 * Generate (or regenerate) a payslip for a month from attendance:
 *   per-day = (basic + hra + conveyance) / days-in-month
 *   present = 1 day, half_day = 0.5, overtime = 1 + hours/8, absent = 0
 * Deductions = that month's `deduction` ledger entries.
 */
export async function generatePayslipAction(input: {
  staffId: string;
  month: string; // "YYYY-MM"
}): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const monthStart = `${input.month}-01`;
  const [y, m] = input.month.split("-").map(Number);
  if (!y || !m) return { error: "Invalid month." };
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthEnd = `${input.month}-${String(daysInMonth).padStart(2, "0")}`;

  const { data: staff } = await supabase
    .from("aimunim_staff")
    .select("basic_salary_paise, hra_paise, conveyance_paise")
    .eq("tenant_id", tenantId)
    .eq("id", input.staffId)
    .single();
  if (!staff) return { error: "Staff member not found." };

  const { data: days } = await supabase
    .from("aimunim_attendance")
    .select("status, overtime_hours")
    .eq("staff_id", input.staffId)
    .gte("day", monthStart)
    .lte("day", monthEnd);

  let presentDays = 0;
  for (const d of days ?? []) {
    if (d.status === "present") presentDays += 1;
    else if (d.status === "half_day") presentDays += 0.5;
    else if (d.status === "overtime") presentDays += 1 + d.overtime_hours / 8;
  }

  const monthlyPaise =
    staff.basic_salary_paise + staff.hra_paise + staff.conveyance_paise;
  const grossPaise = Math.round((monthlyPaise * presentDays) / daysInMonth);

  const { data: deductions } = await supabase
    .from("aimunim_staff_ledger")
    .select("amount_paise")
    .eq("staff_id", input.staffId)
    .eq("kind", "deduction")
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEnd);
  const deductionsPaise = (deductions ?? []).reduce((s, d) => s + d.amount_paise, 0);

  const { error } = await supabase.from("aimunim_payslips").upsert(
    {
      tenant_id: tenantId,
      staff_id: input.staffId,
      month: monthStart,
      days_present: presentDays,
      days_in_month: daysInMonth,
      gross_paise: grossPaise,
      deductions_paise: deductionsPaise,
      net_paise: Math.max(0, grossPaise - deductionsPaise),
    },
    { onConflict: "staff_id,month" },
  );
  if (error) return { error: error.message };
  revalidatePath("/staff");
  return { ok: true };
}
