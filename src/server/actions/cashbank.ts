"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { rupeesToPaise } from "@/lib/money";

export type ActionResult = { ok?: true; error?: string };

const accountSchema = z.object({
  name: z.string().trim().min(1, "Account name is required."),
  accountNumber: z.string().trim().optional(),
  ifsc: z.string().trim().optional(),
  /** Opening balance in rupees. */
  openingBalance: z.coerce.number().default(0),
});

export async function createBankAccountAction(
  input: z.input<typeof accountSchema>,
): Promise<ActionResult> {
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase.from("aimunim_bank_accounts").insert({
    tenant_id: tenantId,
    name: v.name,
    account_number: v.accountNumber || null,
    ifsc: v.ifsc || null,
    opening_balance_paise: rupeesToPaise(v.openingBalance),
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? `An account named "${v.name}" already exists.`
          : error.message,
    };
  }
  revalidatePath("/cash-bank");
  return { ok: true };
}

const adjustmentSchema = z.object({
  /** null/"cash" = cash-in-hand ledger */
  accountId: z.guid().nullable().optional(),
  direction: z.enum(["in", "out"]),
  amount: z.coerce.number().positive("Amount must be > 0."),
  txnDate: z.string().min(1),
  notes: z.string().trim().optional(),
});

/** Manual "Add / Reduce money" entry on cash or a bank account. */
export async function addAdjustmentAction(
  input: z.input<typeof adjustmentSchema>,
): Promise<ActionResult> {
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase.from("aimunim_cashbank_txns").insert({
    tenant_id: tenantId,
    account_id: v.accountId ?? null,
    direction: v.direction,
    amount_paise: rupeesToPaise(v.amount),
    kind: "adjustment",
    txn_date: v.txnDate,
    notes: v.notes || null,
    created_by: userId,
  });
  if (error) return { error: error.message };
  revalidatePath("/cash-bank");
  return { ok: true };
}

const transferSchema = z
  .object({
    fromAccountId: z.guid().nullable(),
    toAccountId: z.guid().nullable(),
    amount: z.coerce.number().positive("Amount must be > 0."),
    txnDate: z.string().min(1),
    notes: z.string().trim().optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "From and To must be different.",
  });

/** Transfer between cash and/or bank accounts — writes both legs atomically-ish. */
export async function transferMoneyAction(
  input: z.input<typeof transferSchema>,
): Promise<ActionResult> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId, userId } = await requireActiveContext();
  const supabase = await createClient();
  const group = crypto.randomUUID();
  const paise = rupeesToPaise(v.amount);

  const { error } = await supabase.from("aimunim_cashbank_txns").insert([
    {
      tenant_id: tenantId,
      account_id: v.fromAccountId,
      direction: "out" as const,
      amount_paise: paise,
      kind: "transfer" as const,
      transfer_group: group,
      txn_date: v.txnDate,
      notes: v.notes || null,
      created_by: userId,
    },
    {
      tenant_id: tenantId,
      account_id: v.toAccountId,
      direction: "in" as const,
      amount_paise: paise,
      kind: "transfer" as const,
      transfer_group: group,
      txn_date: v.txnDate,
      notes: v.notes || null,
      created_by: userId,
    },
  ]);
  if (error) return { error: error.message };
  revalidatePath("/cash-bank");
  return { ok: true };
}
