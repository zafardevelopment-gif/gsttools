import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import {
  AddGodownDialog,
  TransferStockDialog,
  AssignStockDialog,
} from "./godowns-client";

export const metadata = { title: "Godowns · GST Billing" };
export const dynamic = "force-dynamic";

export default async function GodownsPage() {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const [{ data: godowns }, { data: stocks }, { data: items }] = await Promise.all([
    supabase
      .from("aimunim_godowns")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at"),
    supabase.from("aimunim_item_stocks").select("*").eq("tenant_id", tenantId),
    supabase
      .from("aimunim_items")
      .select("id, name, unit, stock_qty, type")
      .eq("tenant_id", tenantId)
      .eq("type", "product")
      .eq("is_active", true)
      .order("name"),
  ]);

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  const godownOptions = (godowns ?? []).map((g) => ({ id: g.id, name: g.name }));
  const itemOptions = (items ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    stock_qty: i.stock_qty,
  }));

  return (
    <div>
      <PageHeader
        title="Godowns / Warehouses"
        description="Per-godown stock, assignment and transfers."
        action={
          <div className="flex flex-wrap gap-2">
            <AssignStockDialog godowns={godownOptions} items={itemOptions} />
            <TransferStockDialog godowns={godownOptions} items={itemOptions} />
            <AddGodownDialog />
          </div>
        }
      />

      {(godowns ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No godowns yet. Create one, then assign stock to it.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(godowns ?? []).map((g) => {
            const rows = (stocks ?? [])
              .filter((s) => s.godown_id === g.id && s.qty !== 0)
              .map((s) => ({ ...s, item: itemById.get(s.item_id) }))
              .filter((s) => s.item);
            return (
              <Card key={g.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{g.name}</CardTitle>
                  {g.address && (
                    <p className="text-xs text-muted-foreground">{g.address}</p>
                  )}
                </CardHeader>
                <CardContent>
                  {rows.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">
                      No stock in this godown.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((s) => (
                            <TableRow key={s.item_id}>
                              <TableCell>{s.item!.name}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {s.qty} {s.item!.unit}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
