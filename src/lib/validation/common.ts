/**
 * Reusable zod field schemas shared across forms.
 */
import { z } from "zod";

export const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Optional GSTIN — empty string is treated as "not provided". */
export const gstinSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v.toUpperCase()))
  .optional()
  .refine((v) => v === undefined || GSTIN_REGEX.test(v), {
    message: "Invalid GSTIN (15 chars, e.g. 27ABCDE1234F1Z5).",
  });

export const stateCodeSchema = z
  .string()
  .regex(/^[0-9]{2}$/, "Select a state.");

export const pincodeSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional()
  .refine((v) => v === undefined || /^[0-9]{6}$/.test(v), {
    message: "PIN code must be 6 digits.",
  });

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const emailSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional()
  .refine((v) => v === undefined || z.string().email().safeParse(v).success, {
    message: "Invalid email.",
  });

/** A rupee string/number input that we convert to integer paise. */
export const rupeesToPaiseSchema = z
  .union([z.string(), z.number()])
  .transform((v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  });

/** Derive the 2-digit state code from a GSTIN, if present. */
export function stateCodeFromGstin(gstin?: string | null): string | undefined {
  if (!gstin || gstin.length < 2) return undefined;
  return gstin.slice(0, 2);
}
