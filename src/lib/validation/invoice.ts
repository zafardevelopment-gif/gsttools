import { z } from "zod";

const numberish = (def = 0) =>
  z.union([z.string(), z.number()]).transform((v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : def;
  });

export const invoiceLineSchema = z.object({
  itemId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, "Item name is required."),
  hsn_sac: z.string().trim().optional(),
  unit: z.string().trim().default("PCS"),
  qty: numberish(1).refine((n) => n > 0, "Qty must be > 0."),
  /** Unit rate in rupees (converted to paise server-side). */
  rate: numberish(0).refine((n) => n >= 0, "Rate can't be negative."),
  taxRate: numberish(0),
  discountPercent: numberish(0),
  isTaxInclusive: z.boolean().optional().default(false),
});

export const invoiceInputSchema = z.object({
  direction: z.enum(["sale", "purchase"]).default("sale"),
  invoiceType: z.enum(["gst", "non_gst"]).default("gst"),
  partyId: z.string().uuid().nullable().optional(),
  invoiceNumber: z.string().trim().optional(),
  invoiceDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  /** Additional charges (freight/packaging) in rupees. */
  additionalCharges: numberish(0),
  roundOff: z.boolean().default(true),
  notes: z.string().trim().optional(),
  terms: z.string().trim().optional(),
  template: z.string().default("classic"),
  status: z.enum(["draft", "final"]).default("final"),
  lines: z.array(invoiceLineSchema).min(1, "Add at least one line item."),
});

export type InvoiceLineInput = z.input<typeof invoiceLineSchema>;
export type InvoiceInput = z.input<typeof invoiceInputSchema>;
export type InvoiceValues = z.output<typeof invoiceInputSchema>;
