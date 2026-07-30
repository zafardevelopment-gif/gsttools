import { PageHeader } from "@/components/page-header";
import { ScanBillDialog } from "./scan-bill-dialog";
import { BillScansTable } from "./bill-scans-table";
import { listBillScans } from "@/server/queries/bill-scans";

export const metadata = { title: "Bill Scan · AI Munim" };

export default async function BillScanPage() {
  const scans = await listBillScans();

  return (
    <div>
      <PageHeader
        title="Bill Scan"
        description="Purchase, expense ya koi bhi bill scan karke data seedha save karein."
        action={<ScanBillDialog />}
      />
      <BillScansTable scans={scans} />
    </div>
  );
}
