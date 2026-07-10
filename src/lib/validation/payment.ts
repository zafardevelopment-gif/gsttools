import { z } from "zod";
import { PAYMENT_MODES } from "@/lib/constants";

const numberish = (def = 0) =>
  z.union([z.string(), z.number()]).transform((v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : def;
  });

export const paymentInputSchema = z.object({
  direction: z.enum(["in", "out"]),
  partyId: z.guid({ error: "Select a party." }),
  invoiceId: z.guid().nullable().optional(),
  /** Amount in rupees (converted to paise in the action). */
  amount: numberish(0).refine((n) => n > 0, "Amount must be greater than 0."),
  mode: z.enum(PAYMENT_MODES).default("cash"),
  paymentDate: z.string().min(1),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type PaymentInput = z.input<typeof paymentInputSchema>;
