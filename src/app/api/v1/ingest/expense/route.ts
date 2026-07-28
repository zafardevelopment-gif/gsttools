import { createIngestHandler } from "@/server/automation/handler";
import { createExpense } from "@/server/services/expenses";
import type { ExpenseFormInput } from "@/lib/validation/expense";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/expense
 *
 * Records a business expense. Same service as the Expenses screen.
 *
 * Body example:
 *   { "category": "Transport", "amount": 1200, "expense_date": "2026-07-28",
 *     "payment_mode": "cash", "notes": "Tempo bhada" }
 */
export const POST = createIngestHandler({
  endpoint: "expense",
  scope: "write",
  handle: async (body, ctx) => {
    const res = await createExpense({
      db: ctx.db,
      tenantId: ctx.tenantId,
      userId: null,
      input: body as ExpenseFormInput,
      source: "api",
    });

    if (res.error || !res.id) {
      return { ok: false, message: res.error ?? "Expense record nahi hua." };
    }

    return {
      ok: true,
      status: 201,
      entityType: "expense",
      entityId: res.id,
      body: { id: res.id },
    };
  },
});
