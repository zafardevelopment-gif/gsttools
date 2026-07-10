import { z } from "zod";
import { PAYMENT_MODES } from "@/lib/constants";

const numberish = (def = 0) =>
  z.union([z.string(), z.number()]).transform((v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : def;
  });

export const expenseFormSchema = z.object({
  category: z.string().trim().min(1, "Category is required."),
  amount: numberish(0).refine((n) => n > 0, "Amount must be greater than 0."),
  expense_date: z.string().min(1),
  payment_mode: z.enum(PAYMENT_MODES).default("cash"),
  partyId: z.guid().nullable().optional(),
  notes: z.string().trim().optional(),
});

export type ExpenseFormInput = z.input<typeof expenseFormSchema>;
