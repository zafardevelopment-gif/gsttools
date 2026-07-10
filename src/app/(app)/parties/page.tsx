import { PageHeader } from "@/components/page-header";
import { PartyFormDialog } from "./party-form-dialog";
import { PartiesTable } from "./parties-table";
import { ImportDialog } from "@/components/import-dialog";
import { importPartiesAction } from "@/server/actions/import";
import { listParties } from "@/server/queries/parties";

export const metadata = { title: "Parties · GST Billing" };

const PARTIES_TEMPLATE = [
  "name,type,gstin,state_code,phone,email,billing_address,opening_balance,pan,category,credit_period_days,credit_limit",
  "Gupta Electronics,customer,27AAACG1234M1Z2,27,9811111111,gupta@example.com,\"FC Road, Pune\",0,AAACG1234M,Retail,30,50000",
  "Mahalaxmi Distributors,supplier,27AAACM9999P1Z1,27,9833333333,,,0,,Wholesale,0,0",
].join("\n");

export default async function PartiesPage() {
  const parties = await listParties();
  return (
    <div>
      <PageHeader
        title="Parties"
        description="Customers and suppliers, with outstanding balances."
        action={
          <div className="flex flex-wrap gap-2">
            <ImportDialog
              entityLabel="parties"
              templateCsv={PARTIES_TEMPLATE}
              templateFilename="parties-template.csv"
              action={importPartiesAction}
            />
            <PartyFormDialog />
          </div>
        }
      />
      <PartiesTable parties={parties} />
    </div>
  );
}
