import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import type { BankAccountRow, CashbankTxnRow } from "@/lib/database.types";

export type AccountWithBalance = BankAccountRow & { balance_paise: number };

export type CashBankSummary = {
  cashPaise: number;
  accounts: AccountWithBalance[];
  totalPaise: number;
  recentTxns: (CashbankTxnRow & { account_name: string | null })[];
};

/**
 * Balances are derived, not stored:
 *   bank account = opening + manual txns ± payments recorded against it
 *   cash in hand = manual cash txns ± cash payments − cash expenses
 */
export async function getCashBankSummary(): Promise<CashBankSummary> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const [{ data: accounts }, { data: txns }, { data: payments }, { data: expenses }] =
    await Promise.all([
      supabase
        .from("aimunim_bank_accounts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("created_at"),
      supabase
        .from("aimunim_cashbank_txns")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("txn_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("aimunim_payments")
        .select("direction, amount_paise, mode, bank_account_id")
        .eq("tenant_id", tenantId),
      supabase
        .from("aimunim_expenses")
        .select("amount_paise, payment_mode")
        .eq("tenant_id", tenantId),
    ]);

  const txnSum = (accountId: string | null) =>
    (txns ?? [])
      .filter((t) => t.account_id === accountId)
      .reduce(
        (sum, t) => sum + (t.direction === "in" ? t.amount_paise : -t.amount_paise),
        0,
      );

  const withBalances: AccountWithBalance[] = (accounts ?? []).map((a) => {
    const paymentSum = (payments ?? [])
      .filter((p) => p.bank_account_id === a.id)
      .reduce(
        (sum, p) => sum + (p.direction === "in" ? p.amount_paise : -p.amount_paise),
        0,
      );
    return {
      ...a,
      balance_paise: a.opening_balance_paise + txnSum(a.id) + paymentSum,
    };
  });

  const cashPayments = (payments ?? [])
    .filter((p) => p.mode === "cash" && !p.bank_account_id)
    .reduce(
      (sum, p) => sum + (p.direction === "in" ? p.amount_paise : -p.amount_paise),
      0,
    );
  const cashExpenses = (expenses ?? [])
    .filter((e) => e.payment_mode === "cash")
    .reduce((sum, e) => sum + e.amount_paise, 0);

  const cashPaise = txnSum(null) + cashPayments - cashExpenses;

  const nameById = new Map(withBalances.map((a) => [a.id, a.name]));
  const recentTxns = (txns ?? []).slice(0, 50).map((t) => ({
    ...t,
    account_name: t.account_id ? (nameById.get(t.account_id) ?? null) : null,
  }));

  return {
    cashPaise,
    accounts: withBalances,
    totalPaise: cashPaise + withBalances.reduce((s, a) => s + a.balance_paise, 0),
    recentTxns,
  };
}
