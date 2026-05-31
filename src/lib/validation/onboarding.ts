import { z } from "zod";
import {
  gstinSchema,
  stateCodeSchema,
  pincodeSchema,
  phoneSchema,
  emailSchema,
} from "@/lib/validation/common";

export const businessSetupSchema = z
  .object({
    name: z.string().trim().min(2, "Business name is required."),
    legal_name: z.string().trim().optional(),
    gstin: gstinSchema,
    state_code: stateCodeSchema,
    address_line1: z.string().trim().optional(),
    address_line2: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    pincode: pincodeSchema,
    phone: phoneSchema,
    email: emailSchema,
  })
  .refine(
    (data) =>
      !data.gstin || data.gstin.slice(0, 2) === data.state_code,
    {
      message: "GSTIN's first 2 digits must match the selected state.",
      path: ["gstin"],
    },
  );

export type BusinessSetupInput = z.infer<typeof businessSetupSchema>;
