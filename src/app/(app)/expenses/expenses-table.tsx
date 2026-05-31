"use client";

import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteExpenseAction } from "@/server/actions/expenses";
import { formatINR } from "@/lib/money";
import type { ExpenseRow } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ExpensesTable({ expenses }: { expenses: ExpenseRow[] }) {
  if (expenses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No expenses yet. Click <span className="font-medium">Add expense</span>.
      </div>
    );
  }
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="text-muted-foreground">{e.expense_date}</TableCell>
              <TableCell>
                <Badge variant="secondary">{e.category}</Badge>
              </TableCell>
              <TableCell className="capitalize">{e.payment_mode}</TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground">
                {e.notes ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatINR(e.amount_paise)}
              </TableCell>
              <TableCell>
                <ConfirmDelete
                  title="Delete expense?"
                  onConfirm={() => deleteExpenseAction(e.id)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
