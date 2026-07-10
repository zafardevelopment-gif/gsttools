import { PageHeader } from "@/components/page-header";
import { ItemFormDialog } from "./item-form-dialog";
import { ItemsTable } from "./items-table";
import { ImportDialog } from "@/components/import-dialog";
import { importItemsAction } from "@/server/actions/import";
import { listItems } from "@/server/queries/items";

export const metadata = { title: "Items · GST Billing" };

const ITEMS_TEMPLATE = [
  "name,type,sku,hsn,unit,category,sale_price,purchase_price,mrp,tax_rate,opening_stock,low_stock_level,barcode,description",
  "LED Bulb 9W,product,LED-9W,85395000,PCS,Lighting,99,65,120,12,100,20,8901234567890,9W cool white",
  "Electrician Visit,service,SVC-01,998719,HOUR,Service,300,0,0,18,0,0,,Per-hour visit charge",
].join("\n");

export default async function ItemsPage() {
  const items = await listItems();
  return (
    <div>
      <PageHeader
        title="Items"
        description="Products and services you sell or buy."
        action={
          <div className="flex flex-wrap gap-2">
            <ImportDialog
              entityLabel="items"
              templateCsv={ITEMS_TEMPLATE}
              templateFilename="items-template.csv"
              action={importItemsAction}
            />
            <ItemFormDialog />
          </div>
        }
      />
      <ItemsTable items={items} />
    </div>
  );
}
