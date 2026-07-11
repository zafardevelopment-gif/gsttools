import { requireRouteAccess } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { listStaff } from "@/server/queries/staff";
import { AddStaffDialog, StaffList } from "./staff-client";

export const metadata = { title: "Staff & Payroll · GST Billing" };
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requireRouteAccess("/staff");
  const staff = await listStaff();

  return (
    <div>
      <PageHeader
        title="Staff Attendance & Payroll"
        description="Mark daily attendance, track advances, and generate payslips."
        action={<AddStaffDialog />}
      />
      <StaffList staff={staff} />
    </div>
  );
}
