-- =============================================================================
-- 0008 — e-Invoicing (IRN) + e-Way bill fields on invoices
-- =============================================================================
-- The IRP/GSP integration is stubbed for now (spec Module 9 allows a mock):
-- the app generates a mock IRN + a QR payload matching the govt format shape.
-- When a real GSP is wired in, only the server action changes — the schema
-- and UI stay the same.

alter table public."aimunim_invoices"
  add column if not exists irn text,
  add column if not exists irn_generated_at timestamptz,
  add column if not exists irn_qr_payload text,       -- signed QR data (mock for now)
  add column if not exists eway_bill_no text,
  add column if not exists eway_generated_at timestamptz;

create index if not exists idx_invoices_irn
  on public."aimunim_invoices"(tenant_id) where irn is not null;
