-- =============================================================================
-- 0011 — Business & invoice settings (myBillBook-style Settings hub)
-- =============================================================================
-- New tenant fields: signature image, UPI id (payment QR on invoices),
-- business/industry/registration type, GST-registered flag, TDS/TCS flags.
-- Display toggles (show party balance/phone/time, receiver signature, default
-- theme, auto-share) live in the existing invoice_settings jsonb.

alter table public."aimunim_tenants"
  add column if not exists signature_path text,     -- path in the `logos` bucket
  add column if not exists upi_id text,             -- e.g. shop@upi → payment QR
  add column if not exists business_type text,
  add column if not exists industry_type text,
  add column if not exists registration_type text,
  add column if not exists gst_registered boolean not null default true,
  add column if not exists tds_enabled boolean not null default false,
  add column if not exists tcs_enabled boolean not null default false,
  -- Tenant-defined units (QUINTAL, BORI, …) shown alongside the built-in list.
  add column if not exists custom_units text[] not null default '{}';
