import { PageHeader } from "@/components/page-header";
import { PartyFormDialog } from "./party-form-dialog";
import { PartiesTable } from "./parties-table";
import { listParties } from "@/server/queries/parties";

export const metadata = { title: "Parties · GST Billing" };

export default async function PartiesPage() {
  const parties = await listParties();
  return (
    <div>
      <PageHeader
        title="Parties"
        description="Customers and suppliers, with outstanding balances."
        action={<PartyFormDialog />}
      />
      <PartiesTable parties={parties} />
    </div>
  );
}
