import { z } from "zod";
import {
  gstinSchema,
  phoneSchema,
  emailSchema,
} from "@/lib/validation/common";

const numberish = (def = 0) =>
  z.union([z.string(), z.number()]).transform((v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : def;
  });

export const partyFormSchema = z
  .object({
    type: z.enum(["customer", "supplier", "both"]),
    name: z.string().trim().min(1, "Party name is required."),
    gstin: gstinSchema,
    // 2-digit place-of-supply code; optional (derived from GSTIN if blank).
    state_code: z
      .string()
      .trim()
      .transform((v) => (v === "" ? undefined : v))
      .optional()
      .refine((v) => v === undefined || /^[0-9]{2}$/.test(v), "Invalid state."),
    phone: phoneSchema,
    email: emailSchema,
    billing_address: z.string().trim().optional(),
    shipping_address: z.string().trim().optional(),
    // Opening balance in rupees (signed): +ve = party owes you; -ve = you owe.
    opening_balance: numberish(0),
    pan: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (v === "" ? undefined : v))
      .optional()
      .refine(
        (v) => v === undefined || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
        "Invalid PAN (e.g. ABCDE1234F).",
      ),
    category: z.string().trim().optional(),
    contact_person: z.string().trim().optional(),
    credit_period_days: numberish(0).refine((n) => n >= 0, "Can't be negative."),
    // Credit limit in rupees (converted to paise in the action).
    credit_limit: numberish(0).refine((n) => n >= 0, "Can't be negative."),
  })
  .refine(
    (d) => !d.gstin || !d.state_code || d.gstin.slice(0, 2) === d.state_code,
    { message: "GSTIN state digits must match the state.", path: ["state_code"] },
  );

export type PartyFormInput = z.input<typeof partyFormSchema>;
export type PartyFormValues = z.output<typeof partyFormSchema>;
