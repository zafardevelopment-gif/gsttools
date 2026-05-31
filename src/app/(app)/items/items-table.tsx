"use client";

import { Pencil } from "lucide-react";
import { ItemFormDialog } from "./item-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteItemAction } from "@/server/actions/items";
import { formatINR } from "@/lib/money";
import type { ItemRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ItemsTable({ items }: { items: ItemRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No items yet. Click <span className="font-medium">New item</span> to add one.
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>HSN/SAC</TableHead>
            <TableHead className="text-right">Sale price</TableHead>
            <TableHead className="text-right">GST</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const low =
              item.type === "product" && item.stock_qty <= item.low_stock_level;
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.type === "service" ? "Service" : "Product"}
                    {item.sku ? ` · ${item.sku}` : ""}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {item.hsn_sac ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {formatINR(item.sale_price_paise)}
                </TableCell>
                <TableCell className="text-right">{item.tax_rate}%</TableCell>
                <TableCell className="text-right">
                  {item.type === "service" ? (
                    "—"
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      {item.stock_qty} {item.unit}
                      {low && <Badge variant="destructive">Low</Badge>}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <ItemFormDialog
                      item={item}
                      trigger={
                        <Button variant="ghost" size="icon">
                          <Pencil className="size-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                      }
                    />
                    <ConfirmDelete
                      title="Delete item?"
                      description={`"${item.name}" will be removed.`}
                      onConfirm={() => deleteItemAction(item.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
