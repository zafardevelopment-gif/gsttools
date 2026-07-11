import { PageHeader } from "@/components/page-header";
import { ExpenseFormDialog } from "./expense-form-dialog";
import { ExpensesTable } from "./expenses-table";
import { listExpenses } from "@/server/queries/expenses";
import { formatINR } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Expenses · AI Munim" };

export default async function ExpensesPage() {
  const expenses = await listExpenses();
  const total = expenses.reduce((s, e) => s + e.amount_paise, 0);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track business spending by category."
        action={<ExpenseFormDialog />}
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Total expenses</p>
            <p className="text-2xl font-bold">{formatINR(total)}</p>
          </CardContent>
        </Card>
      </div>
      <ExpensesTable expenses={expenses} />
    </div>
  );
}
