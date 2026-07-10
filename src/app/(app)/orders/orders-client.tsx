"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateOrderStatusAction } from "@/server/actions/orders";
import type { OnlineOrderRow } from "@/lib/database.types";
import { formatINR } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = ["new", "confirmed", "dispatched", "delivered", "cancelled"] as const;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  new: "destructive",
  confirmed: "secondary",
  dispatched: "secondary",
  delivered: "default",
  cancelled: "secondary",
};

export function OrdersTable({ orders }: { orders: OnlineOrderRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(id: string, status: (typeof STATUSES)[number]) {
    startTransition(async () => {
      const res = await updateOrderStatusAction({ orderId: id, status });
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No online orders yet. Orders placed on your store (or via WhatsApp/n8n)
        will appear here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">{o.order_number}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {o.created_at.slice(0, 10)}
              </TableCell>
              <TableCell>
                <div>{o.customer_name}</div>
                <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatINR(o.total_paise)}
              </TableCell>
              <TableCell className="uppercase text-muted-foreground">
                {o.payment_mode}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[o.status] ?? "secondary"} className="capitalize">
                    {o.status}
                  </Badge>
                  <Select
                    value={o.status}
                    onValueChange={(v) => setStatus(o.id, v as (typeof STATUSES)[number])}
                    disabled={pending}
                  >
                    <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
