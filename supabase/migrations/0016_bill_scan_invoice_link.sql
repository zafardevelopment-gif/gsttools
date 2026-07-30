-- =============================================================================
-- 0016 — Bill scan → purchase invoice link.
-- =============================================================================
-- Purchase-type scans now post a real purchase bill (aimunim_invoices,
-- direction='purchase') under Invoices & Vouchers instead of an expense, so
-- they show up in the Purchases list and the supplier's party ledger — see
-- server/services/bill-scan.ts confirmBillScan(). expense_id (0015) stays for
-- the 'expense' type path.

alter table public."aimunim_bill_scans"
  add column invoice_id uuid references public."aimunim_invoices"(id) on delete set null;
