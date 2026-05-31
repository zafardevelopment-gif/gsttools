import { PageHeader } from "@/components/page-header";
import { ItemFormDialog } from "./item-form-dialog";
import { ItemsTable } from "./items-table";
import { listItems } from "@/server/queries/items";

export const metadata = { title: "Items · GST Billing" };

export default async function ItemsPage() {
  const items = await listItems();
  return (
    <div>
      <PageHeader
        title="Items"
        description="Products and services you sell or buy."
        action={<ItemFormDialog />}
      />
      <ItemsTable items={items} />
    </div>
  );
}
