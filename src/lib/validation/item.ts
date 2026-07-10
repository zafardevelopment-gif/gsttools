import { z } from "zod";
import { GST_RATES, UNITS } from "@/lib/constants";

/** Accept a number-like string/number; default 0 when blank. */
const numberish = (def = 0) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => {
      const n = typeof v === "string" ? Number(v) : v;
      return Number.isFinite(n) ? n : def;
    });

export const itemFormSchema = z.object({
  type: z.enum(["product", "service"]),
  name: z.string().trim().min(1, "Item name is required."),
  sku: z.string().trim().optional(),
  hsn_sac: z.string().trim().optional(),
  unit: z.enum(UNITS).default("PCS"),
  category: z.string().trim().optional(),
  // Rupee inputs from the form; converted to paise in the action.
  sale_price: numberish(0).refine((n) => n >= 0, "Price can't be negative."),
  purchase_price: numberish(0).refine((n) => n >= 0, "Price can't be negative."),
  tax_rate: numberish(0).refine(
    (n) => GST_RATES.includes(n as (typeof GST_RATES)[number]) || (n >= 0 && n <= 100),
    "Invalid tax rate.",
  ),
  is_tax_inclusive: z.coerce.boolean().default(false),
  // Opening stock — only applied on create (products only).
  opening_stock: numberish(0),
  low_stock_level: numberish(0),
  barcode: z.string().trim().optional(),
  // MRP in rupees (converted to paise in the action).
  mrp: numberish(0).refine((n) => n >= 0, "MRP can't be negative."),
  // Wholesale sale price in rupees (0 = use retail price).
  wholesale_price: numberish(0).refine((n) => n >= 0, "Price can't be negative."),
  description: z.string().trim().optional(),
  alt_unit: z.string().trim().optional(),
  // 1 alt_unit = factor × unit (e.g. 1 BOX = 12 PCS).
  alt_unit_factor: numberish(0),
});

export type ItemFormInput = z.input<typeof itemFormSchema>;
export type ItemFormValues = z.output<typeof itemFormSchema>;
