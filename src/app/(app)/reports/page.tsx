import { PageHeader } from "@/components/page-header";
import { ReportToolbar } from "./report-toolbar";
import { ReportView } from "./report-view";
import {
  salesReport,
  purchaseReport,
  outstandingReport,
  stockReport,
  expenseReport,
  currentMonthRange,
  type ReportResult,
} from "@/server/queries/reports";

export const metadata = { title: "Reports · GST Billing" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const month = currentMonthRange();
  const type = sp.type ?? "sales";
  const from = sp.from ?? month.from;
  const to = sp.to ?? month.to;

  let report: ReportResult;
  switch (type) {
    case "purchase":
      report = await purchaseReport(from, to);
      break;
    case "outstanding":
      report = await outstandingReport();
      break;
    case "stock":
      report = await stockReport();
      break;
    case "expense":
      report = await expenseReport(from, to);
      break;
    case "sales":
    default:
      report = await salesReport(from, to);
      break;
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Sales, purchase, outstanding, stock and expense — export to Excel or PDF."
      />
      <ReportToolbar type={type} from={from} to={to} />
      <ReportView report={report} />
    </div>
  );
}
