/**
 * Pure party-balance math — mirrors the DB trigger gst_recompute_party_balance
 * (see supabase/migrations/0004). Kept here so the rule is unit-testable
 * without a database.
 *
 * Sign convention (paise):
 *   balance > 0  => the party owes the business (receivable)
 *   balance < 0  => the business owes the party (payable)
 */
export type LedgerInputs = {
  openingPaise: number;
  salesTotalPaise: number; // sum of non-draft sale invoice totals
  purchaseTotalPaise: number; // sum of non-draft purchase invoice totals
  paymentsInPaise: number; // money received from the party
  paymentsOutPaise: number; // money paid to the party
};

export function computePartyBalance(i: LedgerInputs): number {
  return (
    i.openingPaise +
    i.salesTotalPaise -
    i.purchaseTotalPaise -
    i.paymentsInPaise +
    i.paymentsOutPaise
  );
}

/** Amount still due on an invoice given total and amount paid (never negative). */
export function invoiceBalanceDue(totalPaise: number, paidPaise: number): number {
  return Math.max(0, totalPaise - paidPaise);
}

/** Derive an invoice status from its total and paid amount. */
export function invoiceStatusFromPaid(
  totalPaise: number,
  paidPaise: number,
): "unpaid" | "partial" | "paid" {
  if (paidPaise <= 0) return "unpaid";
  if (paidPaise < totalPaise) return "partial";
  return "paid";
}
