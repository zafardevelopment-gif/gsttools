import { z } from "zod";

export const BILL_SCAN_TYPES = ["purchase", "expense", "other"] as const;
export type BillScanType = (typeof BILL_SCAN_TYPES)[number];

const numberish = (def = 0) =>
  z.union([z.string(), z.number()]).transform((v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : def;
  });

/** What the owner confirms after reviewing the AI-extracted data. */
export const billScanConfirmSchema = z.object({
  id: z.guid(),
  type: z.enum(BILL_SCAN_TYPES),
  vendor_name: z.string().trim().max(200).optional(),
  amount: numberish(0).refine((n) => n > 0, "Amount must be greater than 0."),
  bill_date: z.string().min(1, "Date is required."),
  category: z.string().trim().min(1, "Category is required."),
  notes: z.string().trim().optional(),
});

export type BillScanConfirmInput = z.input<typeof billScanConfirmSchema>;

/** Shape the AI is asked to return — validated before we trust any of it. */
export const billScanExtractionSchema = z.object({
  vendor_name: z.string().trim().max(200).nullable().optional(),
  bill_date: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  type: z.enum(BILL_SCAN_TYPES).nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]).nullable().optional(),
});

export type BillScanExtraction = z.infer<typeof billScanExtractionSchema>;
