-- ============================================================================
-- AIMUNIM Billing SaaS — FINAL COMBINED SETUP (schema + seed + test users)
-- Ek hi file me sab kuch: cleanup → schema (0001→0011) → demo data → users.
-- Supabase SQL Editor me poori file ek saath paste karke run karen.
-- Re-runnable hai: har run pe purana schema drop karke fresh banata hai.
--
-- TEST LOGINS (app me, jab tak real auth off hai):
--   Super Admin : superadmin@aimunim.local / super123   -> /admin panel
--   End User    : user@aimunim.local       / user123    -> Sharma Traders tenant
--
-- Table prefix: aimunim_    |    Generated: 2026-07-11 (v7 — settings hub 0011)
-- ============================================================================

-- ============================================================================
-- SECTION 0 — CLEANUP (idempotent reset)
-- ⚠️ Ye section purane GST_* aur saare aimunim_* tables DROP karta hai (data
-- delete hoga). Testing phase ke liye theek hai — file baar-baar run kar
-- sakte hain, har run fresh schema banata hai.
-- ============================================================================

-- Old GST_-prefixed tables (from previous schema runs)
drop table if exists public."GST_invoice_items"    cascade;
drop table if exists public."GST_payments"         cascade;
drop table if exists public."GST_stock_movements"  cascade;
drop table if exists public."GST_expenses"         cascade;
drop table if exists public."GST_invoices"         cascade;
drop table if exists public."GST_audit_logs"       cascade;
drop table if exists public."GST_invoice_counters" cascade;
drop table if exists public."GST_items"            cascade;
drop table if exists public."GST_parties"          cascade;
drop table if exists public."GST_subscriptions"    cascade;
drop table if exists public."GST_memberships"      cascade;
drop table if exists public."GST_tenants"          cascade;

-- aimunim_-prefixed tables (child tables first, then parents)
drop table if exists public."aimunim_item_stocks"        cascade;
drop table if exists public."aimunim_godowns"            cascade;
drop table if exists public."aimunim_cashbank_txns"      cascade;
drop table if exists public."aimunim_bank_accounts"      cascade;
drop table if exists public."aimunim_notification_logs"  cascade;
drop table if exists public."aimunim_whatsapp_templates" cascade;
drop table if exists public."aimunim_recurring_invoices" cascade;
drop table if exists public."aimunim_reminder_rules"     cascade;
drop table if exists public."aimunim_payslips"           cascade;
drop table if exists public."aimunim_attendance"         cascade;
drop table if exists public."aimunim_staff_ledger"       cascade;
drop table if exists public."aimunim_staff"              cascade;
drop table if exists public."aimunim_online_orders"      cascade;
drop table if exists public."aimunim_campaigns"          cascade;
drop table if exists public."aimunim_invoice_items"      cascade;
drop table if exists public."aimunim_payments"           cascade;
drop table if exists public."aimunim_stock_movements"    cascade;
drop table if exists public."aimunim_expenses"           cascade;
drop table if exists public."aimunim_invoices"           cascade;
drop table if exists public."aimunim_audit_logs"         cascade;
drop table if exists public."aimunim_invoice_counters"   cascade;
drop table if exists public."aimunim_items"              cascade;
drop table if exists public."aimunim_parties"            cascade;
drop table if exists public."aimunim_subscriptions"      cascade;
drop table if exists public."aimunim_memberships"        cascade;
drop table if exists public."aimunim_tenants"            cascade;

-- Storage policies (recreated in section 0006)
drop policy if exists "logos_public_read"    on storage.objects;
drop policy if exists "logos_member_insert"  on storage.objects;
drop policy if exists "logos_member_update"  on storage.objects;
drop policy if exists "logos_member_delete"  on storage.objects;

-- Helper functions (recreated below; cascade drops dependent policies/triggers)
drop function if exists public.gst_create_tenant_with_owner(text, text, text, text, text, text, text, text, text, text, text, text) cascade;
drop function if exists public.gst_next_invoice_number(uuid, text, text) cascade;
drop function if exists public.gst_next_invoice_number(uuid, text) cascade;
drop function if exists public.gst_recompute_party_balance(uuid)   cascade;
drop function if exists public.gst_recompute_invoice_payment(uuid) cascade;
drop function if exists public.gst_after_invoice_change()  cascade;
drop function if exists public.gst_after_payment_change()  cascade;
drop function if exists public.gst_apply_stock_movement()  cascade;
drop function if exists public.gst_set_updated_at()        cascade;
drop function if exists public.current_tenant_ids()        cascade;
drop function if exists public.is_tenant_member(uuid)      cascade;
drop function if exists public.has_tenant_role(uuid, text[]) cascade;
drop function if exists public.is_valid_gstin(text)        cascade;

-- ============================================================================
-- SOURCE: supabase/migrations/0001_extensions_and_helpers.sql
-- ============================================================================

-- =============================================================================
-- 0001 — Extensions, shared helpers, and conventions
-- =============================================================================
-- Conventions for this whole schema:
--   * Every table name is prefixed with `GST_` (project convention).
--   * Every tenant-scoped table has: tenant_id uuid, created_at, updated_at.
--   * Row-Level Security (RLS) is the security boundary. App-layer filtering is
--     NOT trusted. A user may only see rows of tenants they are a member of.
--   * Money is stored as INTEGER PAISE (bigint). Never floats for currency.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";      -- case-insensitive text (emails)

-- Helper functions below reference aimunim_memberships, which is created later in
-- 0002. `language sql` bodies are validated at CREATE time, so we defer that
-- validation here to allow the forward reference within this migration.
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- updated_at auto-touch trigger function
-- -----------------------------------------------------------------------------
create or replace function public.gst_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- current_tenant_ids() — the set of tenant_ids the calling user belongs to.
--
-- SECURITY DEFINER so it can read aimunim_memberships without recursively invoking
-- that table's own RLS policy (which would otherwise reference this function).
-- This is the single source of truth used by every tenant RLS policy.
-- -----------------------------------------------------------------------------
create or replace function public.current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id
  from public."aimunim_memberships" m
  where m.user_id = auth.uid();
$$;

-- is_tenant_member(tid) — convenience boolean used in policies.
create or replace function public.is_tenant_member(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."aimunim_memberships" m
    where m.user_id = auth.uid()
      and m.tenant_id = tid
  );
$$;

-- has_tenant_role(tid, roles[]) — true if caller has one of the given roles.
create or replace function public.has_tenant_role(tid uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."aimunim_memberships" m
    where m.user_id = auth.uid()
      and m.tenant_id = tid
      and m.role = any(roles)
  );
$$;

-- -----------------------------------------------------------------------------
-- GSTIN validation — 15 chars: 2 state digits + 10 PAN chars + entity + Z + check
-- Structural validation only (not the official checksum). NULL allowed (B2C).
-- -----------------------------------------------------------------------------
create or replace function public.is_valid_gstin(gstin text)
returns boolean
language sql
immutable
as $$
  select gstin is null
      or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$';
$$;

-- ============================================================================
-- SOURCE: supabase/migrations/0002_core_tenancy.sql
-- ============================================================================

-- =============================================================================
-- 0002 — Core multi-tenancy: tenants, memberships, subscriptions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- aimunim_tenants — one row per business.
-- -----------------------------------------------------------------------------
create table public."aimunim_tenants" (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  legal_name    text,
  gstin         text check (public.is_valid_gstin(gstin)),
  -- 2-digit GST state code of the business (place of supply origin).
  state_code    text not null check (state_code ~ '^[0-9]{2}$'),
  address_line1 text,
  address_line2 text,
  city          text,
  state         text,
  pincode       text check (pincode is null or pincode ~ '^[0-9]{6}$'),
  phone         text,
  email         citext,
  logo_path     text,                 -- path within the `logos` storage bucket
  -- Denormalised current plan for quick gating; source of truth is aimunim_subscriptions.
  plan          text not null default 'trial'
                check (plan in ('trial','silver','gold','diamond')),
  invoice_prefix text not null default 'INV',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_tenants_updated_at
  before update on public."aimunim_tenants"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- aimunim_memberships — maps a user to a tenant with a role.
-- A user can belong to multiple tenants.
-- -----------------------------------------------------------------------------
create table public."aimunim_memberships" (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public."aimunim_tenants"(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'staff'
             check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index idx_memberships_user on public."aimunim_memberships"(user_id);
create index idx_memberships_tenant on public."aimunim_memberships"(tenant_id);

create trigger trg_memberships_updated_at
  before update on public."aimunim_memberships"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- aimunim_subscriptions — billing state per tenant.
-- -----------------------------------------------------------------------------
create table public."aimunim_subscriptions" (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public."aimunim_tenants"(id) on delete cascade,
  plan                  text not null default 'trial'
                        check (plan in ('trial','silver','gold','diamond')),
  status                text not null default 'trialing'
                        check (status in ('trialing','active','past_due','canceled','expired')),
  trial_ends_at         timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  razorpay_customer_id  text,
  razorpay_subscription_id text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id)
);

create index idx_subscriptions_tenant on public."aimunim_subscriptions"(tenant_id);

create trigger trg_subscriptions_updated_at
  before update on public."aimunim_subscriptions"
  for each row execute function public.gst_set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public."aimunim_tenants"       enable row level security;
alter table public."aimunim_memberships"   enable row level security;
alter table public."aimunim_subscriptions" enable row level security;

-- --- aimunim_tenants -------------------------------------------------------------
create policy tenants_select on public."aimunim_tenants"
  for select using (public.is_tenant_member(id));

create policy tenants_insert on public."aimunim_tenants"
  for insert with check (auth.uid() is not null);

create policy tenants_update on public."aimunim_tenants"
  for update using (public.has_tenant_role(id, array['owner','admin']))
  with check (public.has_tenant_role(id, array['owner','admin']));

create policy tenants_delete on public."aimunim_tenants"
  for delete using (public.has_tenant_role(id, array['owner']));

-- --- aimunim_memberships ---------------------------------------------------------
-- Members can see all memberships of their tenants (to view the team).
create policy memberships_select on public."aimunim_memberships"
  for select using (public.is_tenant_member(tenant_id));

-- Only owner/admin can add/modify/remove members (first owner is created via
-- the SECURITY DEFINER provisioning RPC below, which bypasses RLS).
create policy memberships_insert on public."aimunim_memberships"
  for insert with check (public.has_tenant_role(tenant_id, array['owner','admin']));

create policy memberships_update on public."aimunim_memberships"
  for update using (public.has_tenant_role(tenant_id, array['owner','admin']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin']));

create policy memberships_delete on public."aimunim_memberships"
  for delete using (public.has_tenant_role(tenant_id, array['owner','admin']));

-- --- aimunim_subscriptions -------------------------------------------------------
create policy subscriptions_select on public."aimunim_subscriptions"
  for select using (public.is_tenant_member(tenant_id));

create policy subscriptions_modify on public."aimunim_subscriptions"
  for all using (public.has_tenant_role(tenant_id, array['owner','admin']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin']));

-- =============================================================================
-- Provisioning RPC — create a tenant + owner membership + trial subscription
-- atomically. Used by the business-setup wizard (Step 3). SECURITY DEFINER so
-- the first membership can be created before any membership exists.
-- =============================================================================
create or replace function public.gst_create_tenant_with_owner(
  p_name          text,
  p_state_code    text,
  p_gstin         text default null,
  p_legal_name    text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city          text default null,
  p_state         text default null,
  p_pincode       text default null,
  p_phone         text default null,
  p_email         text default null,
  p_logo_path     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_tenant_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public."aimunim_tenants"
    (name, legal_name, gstin, state_code, address_line1, address_line2,
     city, state, pincode, phone, email, logo_path, plan)
  values
    (p_name, p_legal_name, p_gstin, p_state_code, p_address_line1, p_address_line2,
     p_city, p_state, p_pincode, p_phone, p_email, p_logo_path, 'trial')
  returning id into v_tenant_id;

  insert into public."aimunim_memberships" (tenant_id, user_id, role)
  values (v_tenant_id, v_uid, 'owner');

  insert into public."aimunim_subscriptions"
    (tenant_id, plan, status, trial_ends_at, current_period_start, current_period_end)
  values
    (v_tenant_id, 'trial', 'trialing', now() + interval '14 days', now(), now() + interval '14 days');

  return v_tenant_id;
end;
$$;

revoke all on function public.gst_create_tenant_with_owner(
  text, text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.gst_create_tenant_with_owner(
  text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- ============================================================================
-- SOURCE: supabase/migrations/0003_masters.sql
-- ============================================================================

-- =============================================================================
-- 0003 — Master data: parties (customers/suppliers) and items (products/services)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- aimunim_parties — customers and suppliers.
--
-- balance_paise: signed running outstanding, maintained by triggers in Step 7.
--   > 0  => party owes the business (receivable, typical for customers)
--   < 0  => business owes the party (payable, typical for suppliers)
-- opening_balance_paise uses the same sign convention.
-- -----------------------------------------------------------------------------
create table public."aimunim_parties" (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public."aimunim_tenants"(id) on delete cascade,
  type            text not null default 'customer'
                  check (type in ('customer','supplier','both')),
  name            text not null,
  gstin           text check (public.is_valid_gstin(gstin)),
  -- Place-of-supply state code. If null we derive from gstin's first 2 digits.
  state_code      text check (state_code is null or state_code ~ '^[0-9]{2}$'),
  phone           text,
  email           citext,
  billing_address text,
  shipping_address text,
  opening_balance_paise bigint not null default 0,
  balance_paise   bigint not null default 0,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_parties_tenant on public."aimunim_parties"(tenant_id);
create index idx_parties_tenant_type on public."aimunim_parties"(tenant_id, type);
create index idx_parties_name on public."aimunim_parties"(tenant_id, lower(name));

create trigger trg_parties_updated_at
  before update on public."aimunim_parties"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- aimunim_items — products and services.
-- Prices in integer paise. tax_rate is percent (e.g. 18.00).
-- stock_qty allows fractional units (e.g. 2.500 kg). Services ignore stock.
-- -----------------------------------------------------------------------------
create table public."aimunim_items" (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public."aimunim_tenants"(id) on delete cascade,
  type                 text not null default 'product'
                       check (type in ('product','service')),
  name                 text not null,
  sku                  text,
  hsn_sac              text,
  unit                 text not null default 'PCS',
  category             text,
  sale_price_paise     bigint not null default 0 check (sale_price_paise >= 0),
  purchase_price_paise bigint not null default 0 check (purchase_price_paise >= 0),
  tax_rate             numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  -- If true, sale_price is tax-inclusive (tax is backed out during invoicing).
  is_tax_inclusive     boolean not null default false,
  stock_qty            numeric(14,3) not null default 0,
  low_stock_level      numeric(14,3) not null default 0,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_items_tenant on public."aimunim_items"(tenant_id);
create index idx_items_name on public."aimunim_items"(tenant_id, lower(name));
create index idx_items_hsn on public."aimunim_items"(tenant_id, hsn_sac);
-- Partial index to quickly surface low-stock products.
create index idx_items_low_stock on public."aimunim_items"(tenant_id)
  where type = 'product' and stock_qty <= low_stock_level;

create trigger trg_items_updated_at
  before update on public."aimunim_items"
  for each row execute function public.gst_set_updated_at();

-- =============================================================================
-- RLS — any member of the tenant may read/write its masters.
-- =============================================================================
alter table public."aimunim_parties" enable row level security;
alter table public."aimunim_items"   enable row level security;

create policy parties_select on public."aimunim_parties"
  for select using (public.is_tenant_member(tenant_id));
create policy parties_insert on public."aimunim_parties"
  for insert with check (public.is_tenant_member(tenant_id));
create policy parties_update on public."aimunim_parties"
  for update using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
create policy parties_delete on public."aimunim_parties"
  for delete using (public.is_tenant_member(tenant_id));

create policy items_select on public."aimunim_items"
  for select using (public.is_tenant_member(tenant_id));
create policy items_insert on public."aimunim_items"
  for insert with check (public.is_tenant_member(tenant_id));
create policy items_update on public."aimunim_items"
  for update using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
create policy items_delete on public."aimunim_items"
  for delete using (public.is_tenant_member(tenant_id));

-- ============================================================================
-- SOURCE: supabase/migrations/0004_transactions.sql
-- ============================================================================

-- =============================================================================
-- 0004 — Transactions: invoices, invoice_items, payments, expenses, stock
-- =============================================================================
-- All monetary columns are integer paise. The app's pure tax-calc function
-- (Step 5) computes these values; the DB stores the agreed snapshot.

-- -----------------------------------------------------------------------------
-- aimunim_invoices
--   direction: 'sale' (customer invoice) or 'purchase' (supplier bill) — lets
--   one table feed both the sales and purchase reports.
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_invoices" (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public."aimunim_tenants"(id) on delete cascade,
  party_id                 uuid references public."aimunim_parties"(id) on delete restrict,
  direction                text not null default 'sale'
                           check (direction in ('sale','purchase')),
  invoice_type             text not null default 'gst'
                           check (invoice_type in ('gst','non_gst')),
  invoice_number           text not null,
  invoice_date             date not null default current_date,
  due_date                 date,
  -- Place of supply (2-digit state code) and derived intra/inter-state flag.
  place_of_supply_state    text check (place_of_supply_state is null or place_of_supply_state ~ '^[0-9]{2}$'),
  is_interstate            boolean not null default false,

  -- Money breakdown (paise). See src/lib/gst.ts for how these are derived.
  subtotal_paise           bigint not null default 0,   -- sum of line qty*rate
  discount_paise           bigint not null default 0,   -- total line + invoice discount
  taxable_value_paise      bigint not null default 0,
  cgst_paise               bigint not null default 0,
  sgst_paise               bigint not null default 0,
  igst_paise               bigint not null default 0,
  total_tax_paise          bigint not null default 0,
  additional_charges_paise bigint not null default 0,   -- freight, packaging, etc.
  round_off_paise          bigint not null default 0,   -- signed
  total_paise              bigint not null default 0,

  amount_paid_paise        bigint not null default 0,   -- maintained by payment trigger
  status                   text not null default 'unpaid'
                           check (status in ('draft','unpaid','partial','paid')),
  template                 text not null default 'classic',
  notes                    text,
  terms                    text,
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (tenant_id, direction, invoice_number)
);

create index if not exists idx_invoices_tenant on public."aimunim_invoices"(tenant_id);
create index if not exists idx_invoices_party on public."aimunim_invoices"(party_id);
create index if not exists idx_invoices_tenant_date on public."aimunim_invoices"(tenant_id, invoice_date);
create index if not exists idx_invoices_tenant_status on public."aimunim_invoices"(tenant_id, status);

drop trigger if exists trg_invoices_updated_at on public."aimunim_invoices";
create trigger trg_invoices_updated_at
  before update on public."aimunim_invoices"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- aimunim_invoice_items — line items (snapshots, so edits to masters don't rewrite history)
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_invoice_items" (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public."aimunim_tenants"(id) on delete cascade,
  invoice_id          uuid not null references public."aimunim_invoices"(id) on delete cascade,
  item_id             uuid references public."aimunim_items"(id) on delete set null,
  line_no             int not null default 1,
  name                text not null,
  hsn_sac             text,
  unit                text not null default 'PCS',
  qty                 numeric(14,3) not null default 1 check (qty > 0),
  rate_paise          bigint not null default 0,
  discount_percent    numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  discount_paise      bigint not null default 0,   -- resolved discount amount
  taxable_value_paise bigint not null default 0,
  tax_rate            numeric(5,2) not null default 0,
  cgst_paise          bigint not null default 0,
  sgst_paise          bigint not null default 0,
  igst_paise          bigint not null default 0,
  amount_paise        bigint not null default 0,   -- taxable + tax for the line
  created_at          timestamptz not null default now()
);

create index if not exists idx_invoice_items_invoice on public."aimunim_invoice_items"(invoice_id);
create index if not exists idx_invoice_items_tenant on public."aimunim_invoice_items"(tenant_id);

-- -----------------------------------------------------------------------------
-- aimunim_payments — money received (in) or paid (out), optionally against an invoice
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_payments" (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public."aimunim_tenants"(id) on delete cascade,
  party_id     uuid references public."aimunim_parties"(id) on delete restrict,
  invoice_id   uuid references public."aimunim_invoices"(id) on delete set null,
  direction    text not null check (direction in ('in','out')),
  amount_paise bigint not null check (amount_paise > 0),
  mode         text not null default 'cash'
               check (mode in ('cash','upi','bank','cheque','card','other')),
  reference    text,
  payment_date date not null default current_date,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_payments_tenant on public."aimunim_payments"(tenant_id);
create index if not exists idx_payments_party on public."aimunim_payments"(party_id);
create index if not exists idx_payments_invoice on public."aimunim_payments"(invoice_id);
create index if not exists idx_payments_tenant_date on public."aimunim_payments"(tenant_id, payment_date);

drop trigger if exists trg_payments_updated_at on public."aimunim_payments";
create trigger trg_payments_updated_at
  before update on public."aimunim_payments"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- aimunim_expenses
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_expenses" (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public."aimunim_tenants"(id) on delete cascade,
  category     text not null default 'Miscellaneous',
  amount_paise bigint not null check (amount_paise > 0),
  expense_date date not null default current_date,
  party_id     uuid references public."aimunim_parties"(id) on delete set null,
  payment_mode text not null default 'cash'
               check (payment_mode in ('cash','upi','bank','cheque','card','other')),
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_expenses_tenant on public."aimunim_expenses"(tenant_id);
create index if not exists idx_expenses_tenant_date on public."aimunim_expenses"(tenant_id, expense_date);
create index if not exists idx_expenses_category on public."aimunim_expenses"(tenant_id, category);

drop trigger if exists trg_expenses_updated_at on public."aimunim_expenses";
create trigger trg_expenses_updated_at
  before update on public."aimunim_expenses"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- aimunim_stock_movements — append-only ledger of stock changes.
-- qty_delta is signed: +in (purchase/return), -out (sale).
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_stock_movements" (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public."aimunim_tenants"(id) on delete cascade,
  item_id        uuid not null references public."aimunim_items"(id) on delete cascade,
  qty_delta      numeric(14,3) not null,
  type           text not null
                 check (type in ('sale','purchase','adjustment','opening','return')),
  reference_type text,                 -- e.g. 'invoice'
  reference_id   uuid,                 -- e.g. invoice id
  notes          text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_stock_movements_tenant on public."aimunim_stock_movements"(tenant_id);
create index if not exists idx_stock_movements_item on public."aimunim_stock_movements"(item_id);

-- =============================================================================
-- Triggers: keep derived state (stock, party balance, invoice paid) consistent
-- =============================================================================

-- --- stock: apply qty_delta to the item on insert (ledger is append-only) ----
create or replace function public.gst_apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public."aimunim_items"
    set stock_qty = stock_qty + new.qty_delta
    where id = new.item_id;
  return new;
end;
$$;

drop trigger if exists trg_apply_stock_movement on public."aimunim_stock_movements";
create trigger trg_apply_stock_movement
  after insert on public."aimunim_stock_movements"
  for each row execute function public.gst_apply_stock_movement();

-- --- party balance: recompute from opening + invoices + payments -------------
create or replace function public.gst_recompute_party_balance(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening bigint := 0;
  v_sales   bigint := 0;
  v_purch   bigint := 0;
  v_in      bigint := 0;
  v_out     bigint := 0;
begin
  if p_party_id is null then return; end if;

  select opening_balance_paise into v_opening
    from public."aimunim_parties" where id = p_party_id;

  select coalesce(sum(total_paise),0) into v_sales
    from public."aimunim_invoices"
    where party_id = p_party_id and direction = 'sale' and status <> 'draft';

  select coalesce(sum(total_paise),0) into v_purch
    from public."aimunim_invoices"
    where party_id = p_party_id and direction = 'purchase' and status <> 'draft';

  select coalesce(sum(amount_paise),0) into v_in
    from public."aimunim_payments" where party_id = p_party_id and direction = 'in';

  select coalesce(sum(amount_paise),0) into v_out
    from public."aimunim_payments" where party_id = p_party_id and direction = 'out';

  -- >0 => party owes the business; <0 => business owes the party.
  update public."aimunim_parties"
    set balance_paise = coalesce(v_opening,0) + v_sales - v_purch - v_in + v_out
    where id = p_party_id;
end;
$$;

-- --- invoice paid amount + status from its payments --------------------------
create or replace function public.gst_recompute_invoice_payment(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_paid  bigint;
  v_status text;
  v_dir   text;
begin
  if p_invoice_id is null then return; end if;

  select total_paise, status, direction into v_total, v_status, v_dir
    from public."aimunim_invoices" where id = p_invoice_id;
  if v_total is null then return; end if;

  -- Sale invoices are settled by 'in' payments; purchases by 'out'.
  select coalesce(sum(amount_paise),0) into v_paid
    from public."aimunim_payments"
    where invoice_id = p_invoice_id
      and direction = case when v_dir = 'sale' then 'in' else 'out' end;

  if v_status = 'draft' then
    -- leave drafts untouched
    update public."aimunim_invoices" set amount_paid_paise = v_paid where id = p_invoice_id;
    return;
  end if;

  update public."aimunim_invoices"
    set amount_paid_paise = v_paid,
        status = case
                   when v_paid <= 0 then 'unpaid'
                   when v_paid < v_total then 'partial'
                   else 'paid'
                 end
    where id = p_invoice_id;
end;
$$;

-- Triggers that fan out to the recompute helpers.
create or replace function public.gst_after_invoice_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.gst_recompute_party_balance(coalesce(new.party_id, old.party_id));
  if tg_op <> 'DELETE' then
    perform public.gst_recompute_invoice_payment(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_after_invoice_change on public."aimunim_invoices";
-- pg_trigger_depth() = 0 guard: gst_recompute_invoice_payment() writes back to
-- aimunim_invoices (amount_paid_paise/status). Without this guard that self-UPDATE
-- re-fires this trigger, recursing until "stack depth limit exceeded".
create trigger trg_after_invoice_change
  after insert or update or delete on public."aimunim_invoices"
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.gst_after_invoice_change();

create or replace function public.gst_after_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.gst_recompute_party_balance(coalesce(new.party_id, old.party_id));
  perform public.gst_recompute_invoice_payment(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

drop trigger if exists trg_after_payment_change on public."aimunim_payments";
create trigger trg_after_payment_change
  after insert or update or delete on public."aimunim_payments"
  for each row execute function public.gst_after_payment_change();

-- =============================================================================
-- RLS — tenant isolation for all transaction tables
-- =============================================================================
alter table public."aimunim_invoices"        enable row level security;
alter table public."aimunim_invoice_items"   enable row level security;
alter table public."aimunim_payments"        enable row level security;
alter table public."aimunim_expenses"        enable row level security;
alter table public."aimunim_stock_movements" enable row level security;

drop policy if exists invoices_all on public."aimunim_invoices";
create policy invoices_all on public."aimunim_invoices"
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

drop policy if exists invoice_items_all on public."aimunim_invoice_items";
create policy invoice_items_all on public."aimunim_invoice_items"
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

drop policy if exists payments_all on public."aimunim_payments";
create policy payments_all on public."aimunim_payments"
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

drop policy if exists expenses_all on public."aimunim_expenses";
create policy expenses_all on public."aimunim_expenses"
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

drop policy if exists stock_movements_all on public."aimunim_stock_movements";
create policy stock_movements_all on public."aimunim_stock_movements"
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ============================================================================
-- SOURCE: supabase/migrations/0005_audit_and_counters.sql
-- ============================================================================

-- =============================================================================
-- 0005 — Audit log + atomic invoice-number generator
-- =============================================================================

-- -----------------------------------------------------------------------------
-- aimunim_audit_logs — lightweight activity trail.
-- -----------------------------------------------------------------------------
create table public."aimunim_audit_logs" (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public."aimunim_tenants"(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,                 -- e.g. 'invoice.created'
  entity_type text,                           -- e.g. 'invoice'
  entity_id   uuid,
  data        jsonb,
  created_at  timestamptz not null default now()
);

create index idx_audit_tenant_date on public."aimunim_audit_logs"(tenant_id, created_at desc);

alter table public."aimunim_audit_logs" enable row level security;

-- Owners/admins can read the trail; any member can append their own actions.
create policy audit_select on public."aimunim_audit_logs"
  for select using (public.has_tenant_role(tenant_id, array['owner','admin']));
create policy audit_insert on public."aimunim_audit_logs"
  for insert with check (public.is_tenant_member(tenant_id));

-- -----------------------------------------------------------------------------
-- aimunim_invoice_counters — per (tenant, direction) running sequence so invoice
-- numbers never collide under concurrency.
-- -----------------------------------------------------------------------------
create table public."aimunim_invoice_counters" (
  tenant_id uuid not null references public."aimunim_tenants"(id) on delete cascade,
  direction text not null check (direction in ('sale','purchase')),
  last_seq  bigint not null default 0,
  primary key (tenant_id, direction)
);

alter table public."aimunim_invoice_counters" enable row level security;
create policy invoice_counters_select on public."aimunim_invoice_counters"
  for select using (public.is_tenant_member(tenant_id));

-- gst_next_invoice_number(tenant, direction) -> formatted string.
-- Atomically bumps the counter (row lock via upsert) and formats as
-- e.g. INV/2026/000123 (prefix comes from the tenant; purchases use 'PUR').
create or replace function public.gst_next_invoice_number(
  p_tenant_id uuid,
  p_direction text default 'sale'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq    bigint;
  v_prefix text;
  v_fy     text;
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'Not a member of this tenant';
  end if;

  insert into public."aimunim_invoice_counters" (tenant_id, direction, last_seq)
  values (p_tenant_id, p_direction, 1)
  on conflict (tenant_id, direction)
  do update set last_seq = public."aimunim_invoice_counters".last_seq + 1
  returning last_seq into v_seq;

  if p_direction = 'purchase' then
    v_prefix := 'PUR';
  else
    select coalesce(invoice_prefix, 'INV') into v_prefix
      from public."aimunim_tenants" where id = p_tenant_id;
  end if;

  -- Indian financial year (Apr–Mar) tag, e.g. 2526 for FY 2025-26.
  v_fy := to_char(
            case when extract(month from current_date) >= 4
                 then current_date else current_date - interval '1 year' end,
            'YY')
        || to_char(
            case when extract(month from current_date) >= 4
                 then current_date + interval '1 year' else current_date end,
            'YY');

  return v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 5, '0');
end;
$$;

revoke all on function public.gst_next_invoice_number(uuid, text) from public;
grant execute on function public.gst_next_invoice_number(uuid, text) to authenticated;

-- ============================================================================
-- SOURCE: supabase/migrations/0006_storage.sql
-- ============================================================================

-- =============================================================================
-- 0006 — Storage: business logos bucket
-- =============================================================================
-- Logos are stored under a path namespaced by tenant id: `<tenant_id>/logo.<ext>`.
-- Access is restricted so a user can only read/write objects of tenants they
-- belong to. The bucket is public-read for rendering logos on shared invoices.

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Helper: first path segment of an object name is the tenant id.
-- storage.foldername(name) returns text[]; element 1 is the top folder.

-- Read: public (so logos render on shared/printed invoices).
create policy "logos_public_read"
  on storage.objects for select
  using (bucket_id = 'logos');

-- Write/update/delete: only members of the tenant that owns the folder.
create policy "logos_member_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "logos_member_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'logos'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "logos_member_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

-- ============================================================================
-- SOURCE: supabase/migrations/0007_full_spec.sql
-- ============================================================================

-- =============================================================================
-- 0007 — Full-spec expansion (billing-app-development-prompt.md)
-- Voucher types, godowns, cash & bank, notifications (WhatsApp-first),
-- automated bills, staff & payroll, online orders, marketing campaigns,
-- party/item enhancements, expanded roles and plan tiers.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plan tiers: keep legacy silver/gold, add platinum/enterprise
-- -----------------------------------------------------------------------------
alter table public."aimunim_tenants" drop constraint if exists "aimunim_tenants_plan_check";
alter table public."aimunim_tenants" add constraint "aimunim_tenants_plan_check"
  check (plan in ('trial','silver','gold','diamond','platinum','enterprise'));

alter table public."aimunim_subscriptions" drop constraint if exists "aimunim_subscriptions_plan_check";
alter table public."aimunim_subscriptions" add constraint "aimunim_subscriptions_plan_check"
  check (plan in ('trial','silver','gold','diamond','platinum','enterprise'));

-- -----------------------------------------------------------------------------
-- 2. Roles: expand membership roles per spec (Manage Users module)
-- -----------------------------------------------------------------------------
alter table public."aimunim_memberships" drop constraint if exists "aimunim_memberships_role_check";
alter table public."aimunim_memberships" add constraint "aimunim_memberships_role_check"
  check (role in ('owner','admin','partner','ca','salesman','stock_manager','delivery_boy','staff'));

-- -----------------------------------------------------------------------------
-- 3. Tenant settings: notification channel + online store + invoice/print prefs
-- -----------------------------------------------------------------------------
alter table public."aimunim_tenants"
  add column if not exists notification_channel text not null default 'whatsapp'
    check (notification_channel in ('whatsapp','sms','both')),
  add column if not exists store_enabled boolean not null default false,
  add column if not exists store_slug text,
  add column if not exists pan text,
  add column if not exists financial_year_start date,
  add column if not exists invoice_settings jsonb not null default '{}'::jsonb,
  add column if not exists print_settings jsonb not null default '{}'::jsonb,
  add column if not exists default_terms text;

create unique index if not exists idx_tenants_store_slug
  on public."aimunim_tenants"(store_slug) where store_slug is not null;

-- -----------------------------------------------------------------------------
-- 4. Party enhancements
-- -----------------------------------------------------------------------------
alter table public."aimunim_parties"
  add column if not exists pan text,
  add column if not exists category text,
  add column if not exists credit_period_days int not null default 0 check (credit_period_days >= 0),
  add column if not exists credit_limit_paise bigint not null default 0 check (credit_limit_paise >= 0),
  add column if not exists contact_person text,
  add column if not exists date_of_birth date,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  -- Shared-ledger portal: a random token makes the party's ledger link shareable.
  add column if not exists share_token uuid not null default gen_random_uuid();

create index if not exists idx_parties_category on public."aimunim_parties"(tenant_id, category);
create unique index if not exists idx_parties_share_token on public."aimunim_parties"(share_token);

-- -----------------------------------------------------------------------------
-- 5. Item enhancements
-- -----------------------------------------------------------------------------
alter table public."aimunim_items"
  add column if not exists barcode text,
  add column if not exists mrp_paise bigint not null default 0 check (mrp_paise >= 0),
  add column if not exists alt_unit text,
  add column if not exists alt_unit_factor numeric(14,4),  -- 1 alt_unit = factor × unit
  add column if not exists description text,
  add column if not exists image_path text,
  add column if not exists default_discount_percent numeric(5,2) not null default 0
    check (default_discount_percent >= 0 and default_discount_percent <= 100);

create index if not exists idx_items_barcode on public."aimunim_items"(tenant_id, barcode);

-- -----------------------------------------------------------------------------
-- 6. Godowns (warehouses) + per-godown stock
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_godowns" (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public."aimunim_tenants"(id) on delete cascade,
  name       text not null,
  address    text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists idx_godowns_tenant on public."aimunim_godowns"(tenant_id);

drop trigger if exists trg_godowns_updated_at on public."aimunim_godowns";
create trigger trg_godowns_updated_at
  before update on public."aimunim_godowns"
  for each row execute function public.gst_set_updated_at();

create table if not exists public."aimunim_item_stocks" (
  tenant_id uuid not null references public."aimunim_tenants"(id) on delete cascade,
  item_id   uuid not null references public."aimunim_items"(id) on delete cascade,
  godown_id uuid not null references public."aimunim_godowns"(id) on delete cascade,
  qty       numeric(14,3) not null default 0,
  primary key (item_id, godown_id)
);

create index if not exists idx_item_stocks_tenant on public."aimunim_item_stocks"(tenant_id);
create index if not exists idx_item_stocks_godown on public."aimunim_item_stocks"(godown_id);

-- Stock movements can now carry the godown they hit.
alter table public."aimunim_stock_movements"
  add column if not exists godown_id uuid references public."aimunim_godowns"(id) on delete set null;

-- Keep per-godown stock in sync when a movement names a godown.
create or replace function public.gst_apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public."aimunim_items"
    set stock_qty = stock_qty + new.qty_delta
    where id = new.item_id;

  if new.godown_id is not null then
    insert into public."aimunim_item_stocks" (tenant_id, item_id, godown_id, qty)
    values (new.tenant_id, new.item_id, new.godown_id, new.qty_delta)
    on conflict (item_id, godown_id)
    do update set qty = public."aimunim_item_stocks".qty + excluded.qty;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Voucher types — one table serves all voucher kinds (spec: Voucher entity)
--    invoice        : normal sale/purchase invoice (ledger + stock effect)
--    quotation      : sales quote (no effect)          [direction=sale]
--    proforma       : proforma invoice (no effect)     [direction=sale]
--    delivery_challan: dispatch doc (stock only, app-controlled) [sale]
--    sales_return   : return in  (reverses sale ledger+stock)     [sale]
--    credit_note    : credit against sale (ledger only)           [sale]
--    purchase_return: return out (reverses purchase ledger+stock) [purchase]
--    debit_note     : debit against purchase (ledger only)        [purchase]
--    purchase_order : PO (no effect)                              [purchase]
-- -----------------------------------------------------------------------------
alter table public."aimunim_invoices"
  add column if not exists voucher_type text not null default 'invoice'
    check (voucher_type in ('invoice','quotation','proforma','delivery_challan',
                            'sales_return','credit_note',
                            'purchase_return','debit_note','purchase_order')),
  add column if not exists against_invoice_id uuid references public."aimunim_invoices"(id) on delete set null,
  add column if not exists payment_terms_days int,
  add column if not exists is_cancelled boolean not null default false,
  add column if not exists cancelled_reason text;

-- Numbering is now per (tenant, direction, voucher_type).
alter table public."aimunim_invoices"
  drop constraint if exists "aimunim_invoices_tenant_id_direction_invoice_number_key";
create unique index if not exists idx_invoices_number_unique
  on public."aimunim_invoices"(tenant_id, direction, voucher_type, invoice_number);
create index if not exists idx_invoices_voucher_type
  on public."aimunim_invoices"(tenant_id, voucher_type);

-- Counters gain a voucher_type dimension (existing rows = 'invoice').
alter table public."aimunim_invoice_counters"
  add column if not exists voucher_type text not null default 'invoice';
alter table public."aimunim_invoice_counters"
  drop constraint if exists "aimunim_invoice_counters_pkey";
alter table public."aimunim_invoice_counters"
  add primary key (tenant_id, direction, voucher_type);

-- Voucher-number generator: per-type prefixes.
-- Drop the old 2-arg version first: its p_direction had a DEFAULT, and
-- CREATE OR REPLACE cannot remove parameter defaults (42P13).
drop function if exists public.gst_next_invoice_number(uuid, text);

create or replace function public.gst_next_invoice_number(
  p_tenant_id uuid,
  p_direction text default 'sale',
  p_voucher_type text default 'invoice'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq    bigint;
  v_prefix text;
  v_fy     text;
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'Not a member of this tenant';
  end if;

  insert into public."aimunim_invoice_counters" (tenant_id, direction, voucher_type, last_seq)
  values (p_tenant_id, p_direction, p_voucher_type, 1)
  on conflict (tenant_id, direction, voucher_type)
  do update set last_seq = public."aimunim_invoice_counters".last_seq + 1
  returning last_seq into v_seq;

  v_prefix := case p_voucher_type
    when 'quotation'        then 'QUO'
    when 'proforma'         then 'PRF'
    when 'delivery_challan' then 'DC'
    when 'sales_return'     then 'SRN'
    when 'credit_note'      then 'CRN'
    when 'purchase_return'  then 'PRN'
    when 'debit_note'       then 'DBN'
    when 'purchase_order'   then 'PO'
    else case when p_direction = 'purchase' then 'PUR' else null end
  end;

  if v_prefix is null then
    select coalesce(invoice_prefix, 'INV') into v_prefix
      from public."aimunim_tenants" where id = p_tenant_id;
  end if;

  v_fy := to_char(
            case when extract(month from current_date) >= 4
                 then current_date else current_date - interval '1 year' end,
            'YY')
        || to_char(
            case when extract(month from current_date) >= 4
                 then current_date + interval '1 year' else current_date end,
            'YY');

  return v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 5, '0');
end;
$$;

-- NOTE: no 2-arg wrapper — keeping both signatures alongside the defaulted
-- 3-arg version would make 2-argument calls ambiguous ("function is not
-- unique"). Callers omit p_voucher_type to get the 'invoice' default.

revoke all on function public.gst_next_invoice_number(uuid, text, text) from public;
grant execute on function public.gst_next_invoice_number(uuid, text, text) to authenticated;

-- Party balance: only financial voucher types count; returns/notes reverse.
create or replace function public.gst_recompute_party_balance(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening bigint := 0;
  v_sales   bigint := 0;
  v_sale_rev bigint := 0;
  v_purch   bigint := 0;
  v_purch_rev bigint := 0;
  v_in      bigint := 0;
  v_out     bigint := 0;
begin
  if p_party_id is null then return; end if;

  select opening_balance_paise into v_opening
    from public."aimunim_parties" where id = p_party_id;

  select coalesce(sum(total_paise),0) into v_sales
    from public."aimunim_invoices"
    where party_id = p_party_id and direction = 'sale'
      and voucher_type = 'invoice'
      and status <> 'draft' and not is_cancelled;

  -- Sales return / credit note reduce what the customer owes.
  select coalesce(sum(total_paise),0) into v_sale_rev
    from public."aimunim_invoices"
    where party_id = p_party_id and direction = 'sale'
      and voucher_type in ('sales_return','credit_note')
      and status <> 'draft' and not is_cancelled;

  select coalesce(sum(total_paise),0) into v_purch
    from public."aimunim_invoices"
    where party_id = p_party_id and direction = 'purchase'
      and voucher_type = 'invoice'
      and status <> 'draft' and not is_cancelled;

  -- Purchase return / debit note reduce what we owe the supplier.
  select coalesce(sum(total_paise),0) into v_purch_rev
    from public."aimunim_invoices"
    where party_id = p_party_id and direction = 'purchase'
      and voucher_type in ('purchase_return','debit_note')
      and status <> 'draft' and not is_cancelled;

  select coalesce(sum(amount_paise),0) into v_in
    from public."aimunim_payments" where party_id = p_party_id and direction = 'in';

  select coalesce(sum(amount_paise),0) into v_out
    from public."aimunim_payments" where party_id = p_party_id and direction = 'out';

  update public."aimunim_parties"
    set balance_paise = coalesce(v_opening,0)
                        + (v_sales - v_sale_rev)
                        - (v_purch - v_purch_rev)
                        - v_in + v_out
    where id = p_party_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Cash & Bank
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_bank_accounts" (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public."aimunim_tenants"(id) on delete cascade,
  name                  text not null,           -- display name, e.g. "HDFC Current"
  account_number        text,
  ifsc                  text,
  opening_balance_paise bigint not null default 0,
  is_default            boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists idx_bank_accounts_tenant on public."aimunim_bank_accounts"(tenant_id);

drop trigger if exists trg_bank_accounts_updated_at on public."aimunim_bank_accounts";
create trigger trg_bank_accounts_updated_at
  before update on public."aimunim_bank_accounts"
  for each row execute function public.gst_set_updated_at();

-- Manual cash/bank ledger entries: adjustments and transfers.
-- account_id NULL = the cash-in-hand ledger.
create table if not exists public."aimunim_cashbank_txns" (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public."aimunim_tenants"(id) on delete cascade,
  account_id     uuid references public."aimunim_bank_accounts"(id) on delete cascade,
  direction      text not null check (direction in ('in','out')),
  amount_paise   bigint not null check (amount_paise > 0),
  kind           text not null default 'adjustment'
                 check (kind in ('adjustment','transfer')),
  transfer_group uuid,                          -- pairs the two legs of a transfer
  txn_date       date not null default current_date,
  notes          text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_cashbank_txns_tenant on public."aimunim_cashbank_txns"(tenant_id, txn_date);
create index if not exists idx_cashbank_txns_account on public."aimunim_cashbank_txns"(account_id);

-- Payments can be tied to a specific bank account.
alter table public."aimunim_payments"
  add column if not exists bank_account_id uuid references public."aimunim_bank_accounts"(id) on delete set null;

-- -----------------------------------------------------------------------------
-- 9. Notifications (WhatsApp-first, SMS dormant) — logs + templates
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_notification_logs" (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public."aimunim_tenants"(id) on delete cascade,
  channel    text not null check (channel in ('whatsapp','sms')),
  template   text not null,                     -- e.g. 'invoice_generated'
  recipient  text not null,                     -- phone number
  status     text not null default 'queued'
             check (status in ('queued','sent','delivered','failed','skipped')),
  error      text,
  payload    jsonb,
  entity_type text,                             -- e.g. 'invoice'
  entity_id  uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_logs_tenant
  on public."aimunim_notification_logs"(tenant_id, created_at desc);

create table if not exists public."aimunim_whatsapp_templates" (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public."aimunim_tenants"(id) on delete cascade,
  name       text not null,                     -- Meta template name
  language   text not null default 'en',
  category   text not null default 'utility',
  body       text,
  status     text not null default 'pending'
             check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name, language)
);

drop trigger if exists trg_wa_templates_updated_at on public."aimunim_whatsapp_templates";
create trigger trg_wa_templates_updated_at
  before update on public."aimunim_whatsapp_templates"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- 10. Automated bills (recurring invoices) + payment reminder rules
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_recurring_invoices" (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public."aimunim_tenants"(id) on delete cascade,
  party_id      uuid not null references public."aimunim_parties"(id) on delete cascade,
  name          text not null,                  -- e.g. "Monthly AMC bill"
  frequency     text not null check (frequency in ('daily','weekly','monthly')),
  next_run_date date not null,
  last_run_at   timestamptz,
  -- Snapshot of line items to bill each cycle:
  -- [{item_id, name, hsn_sac, unit, qty, rate_paise, discount_percent, tax_rate}]
  items         jsonb not null default '[]'::jsonb,
  auto_share    boolean not null default true,  -- send via NotificationService on create
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_recurring_tenant on public."aimunim_recurring_invoices"(tenant_id);
create index if not exists idx_recurring_due
  on public."aimunim_recurring_invoices"(next_run_date) where is_active;

drop trigger if exists trg_recurring_updated_at on public."aimunim_recurring_invoices";
create trigger trg_recurring_updated_at
  before update on public."aimunim_recurring_invoices"
  for each row execute function public.gst_set_updated_at();

create table if not exists public."aimunim_reminder_rules" (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public."aimunim_tenants"(id) on delete cascade,
  -- negative = days before due date, positive = days after (overdue)
  offset_days int not null,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, offset_days)
);

-- -----------------------------------------------------------------------------
-- 11. Staff attendance & payroll
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_staff" (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public."aimunim_tenants"(id) on delete cascade,
  name                   text not null,
  phone                  text,
  designation            text,
  basic_salary_paise     bigint not null default 0 check (basic_salary_paise >= 0),
  hra_paise              bigint not null default 0 check (hra_paise >= 0),
  conveyance_paise       bigint not null default 0 check (conveyance_paise >= 0),
  is_active              boolean not null default true,
  joined_on              date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_staff_tenant on public."aimunim_staff"(tenant_id);

drop trigger if exists trg_staff_updated_at on public."aimunim_staff";
create trigger trg_staff_updated_at
  before update on public."aimunim_staff"
  for each row execute function public.gst_set_updated_at();

create table if not exists public."aimunim_attendance" (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public."aimunim_tenants"(id) on delete cascade,
  staff_id   uuid not null references public."aimunim_staff"(id) on delete cascade,
  day        date not null,
  status     text not null check (status in ('present','absent','half_day','overtime')),
  overtime_hours numeric(5,2) not null default 0,
  notes      text,
  created_at timestamptz not null default now(),
  unique (staff_id, day)
);

create index if not exists idx_attendance_tenant_day on public."aimunim_attendance"(tenant_id, day);

-- Advances / loans / deductions with running settlement.
create table if not exists public."aimunim_staff_ledger" (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public."aimunim_tenants"(id) on delete cascade,
  staff_id     uuid not null references public."aimunim_staff"(id) on delete cascade,
  kind         text not null check (kind in ('advance','loan','deduction','repayment')),
  amount_paise bigint not null check (amount_paise > 0),
  entry_date   date not null default current_date,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_staff_ledger_staff on public."aimunim_staff_ledger"(staff_id, entry_date);

create table if not exists public."aimunim_payslips" (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public."aimunim_tenants"(id) on delete cascade,
  staff_id          uuid not null references public."aimunim_staff"(id) on delete cascade,
  month             date not null,              -- first day of the month
  days_present      numeric(5,2) not null default 0,
  days_in_month     int not null default 30,
  gross_paise       bigint not null default 0,
  deductions_paise  bigint not null default 0,
  net_paise         bigint not null default 0,
  generated_at      timestamptz not null default now(),
  unique (staff_id, month)
);

create index if not exists idx_payslips_tenant_month on public."aimunim_payslips"(tenant_id, month);

-- -----------------------------------------------------------------------------
-- 12. Online store / orders
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_online_orders" (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public."aimunim_tenants"(id) on delete cascade,
  order_number   text not null,
  customer_name  text not null,
  customer_phone text not null,
  address        text,
  -- [{item_id, name, qty, rate_paise, amount_paise}]
  items          jsonb not null default '[]'::jsonb,
  total_paise    bigint not null default 0,
  status         text not null default 'new'
                 check (status in ('new','confirmed','dispatched','delivered','cancelled')),
  payment_mode   text not null default 'cod'
                 check (payment_mode in ('cod','upi','online')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, order_number)
);

create index if not exists idx_online_orders_tenant
  on public."aimunim_online_orders"(tenant_id, created_at desc);

drop trigger if exists trg_online_orders_updated_at on public."aimunim_online_orders";
create trigger trg_online_orders_updated_at
  before update on public."aimunim_online_orders"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- 13. Marketing campaigns (WhatsApp-first; SMS via the same builder)
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_campaigns" (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public."aimunim_tenants"(id) on delete cascade,
  name        text not null,
  channel     text not null default 'whatsapp' check (channel in ('whatsapp','sms')),
  template    text,                             -- WhatsApp template name (if channel=whatsapp)
  body        text,                             -- freeform body (sms) / template params
  audience    text not null default 'customers'
              check (audience in ('all','customers','suppliers')),
  status      text not null default 'draft'
              check (status in ('draft','sending','sent','failed')),
  sent_count  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_campaigns_tenant on public."aimunim_campaigns"(tenant_id, created_at desc);

drop trigger if exists trg_campaigns_updated_at on public."aimunim_campaigns";
create trigger trg_campaigns_updated_at
  before update on public."aimunim_campaigns"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- 14. RLS for every new table (tenant-member isolation)
-- -----------------------------------------------------------------------------
alter table public."aimunim_godowns"            enable row level security;
alter table public."aimunim_item_stocks"        enable row level security;
alter table public."aimunim_bank_accounts"      enable row level security;
alter table public."aimunim_cashbank_txns"      enable row level security;
alter table public."aimunim_notification_logs"  enable row level security;
alter table public."aimunim_whatsapp_templates" enable row level security;
alter table public."aimunim_recurring_invoices" enable row level security;
alter table public."aimunim_reminder_rules"     enable row level security;
alter table public."aimunim_staff"              enable row level security;
alter table public."aimunim_attendance"         enable row level security;
alter table public."aimunim_staff_ledger"       enable row level security;
alter table public."aimunim_payslips"           enable row level security;
alter table public."aimunim_online_orders"      enable row level security;
alter table public."aimunim_campaigns"          enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'aimunim_godowns','aimunim_item_stocks','aimunim_bank_accounts',
    'aimunim_cashbank_txns','aimunim_notification_logs','aimunim_whatsapp_templates',
    'aimunim_recurring_invoices','aimunim_reminder_rules','aimunim_staff',
    'aimunim_attendance','aimunim_staff_ledger','aimunim_payslips',
    'aimunim_online_orders','aimunim_campaigns'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all
         using (public.is_tenant_member(tenant_id))
         with check (public.is_tenant_member(tenant_id))',
      t || '_all', t);
  end loop;
end $$;

-- ============================================================================
-- SOURCE: supabase/migrations/0008_einvoicing.sql
-- ============================================================================

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

-- ============================================================================
-- SOURCE: supabase/migrations/0009_wholesale_billing.sql
-- ============================================================================

-- =============================================================================
-- 0009 — Wholesale billing (DukaanMitra 2.0 spec, Module 2 B08)
-- =============================================================================
-- Retail vs wholesale pricing: items get a separate wholesale price, and each
-- party gets a pricing tier. Billing (form/POS/WhatsApp API) picks the price
-- by the party's tier; wholesale falls back to retail when unset.

alter table public."aimunim_items"
  add column if not exists wholesale_price_paise bigint not null default 0
    check (wholesale_price_paise >= 0);

alter table public."aimunim_parties"
  add column if not exists pricing_tier text not null default 'retail'
    check (pricing_tier in ('retail','wholesale'));

create index if not exists idx_parties_pricing_tier
  on public."aimunim_parties"(tenant_id, pricing_tier);

-- ============================================================================
-- SOURCE: supabase/migrations/0010_fix_number_fn_devmode.sql
-- ============================================================================

-- =============================================================================
-- 0010 — Fix: gst_next_invoice_number under service-role (dev auth mode)
-- =============================================================================
-- The dev-auth bypass (NEXT_PUBLIC_AUTH_DISABLED) runs the app on the
-- service-role client, where auth.uid() is NULL — so the strict
-- is_tenant_member() check raised "Not a member of this tenant" on every
-- invoice save. Service role isn't RLS-bound anyway, and EXECUTE on this
-- function is revoked from public/anon, so a NULL uid caller can only be the
-- trusted server. Keep the membership check for real signed-in users.

create or replace function public.gst_next_invoice_number(
  p_tenant_id uuid,
  p_direction text default 'sale',
  p_voucher_type text default 'invoice'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq    bigint;
  v_prefix text;
  v_fy     text;
begin
  -- NULL uid = trusted server context (service role); real users must belong.
  if auth.uid() is not null and not public.is_tenant_member(p_tenant_id) then
    raise exception 'Not a member of this tenant';
  end if;

  insert into public."aimunim_invoice_counters" (tenant_id, direction, voucher_type, last_seq)
  values (p_tenant_id, p_direction, p_voucher_type, 1)
  on conflict (tenant_id, direction, voucher_type)
  do update set last_seq = public."aimunim_invoice_counters".last_seq + 1
  returning last_seq into v_seq;

  v_prefix := case p_voucher_type
    when 'quotation'        then 'QUO'
    when 'proforma'         then 'PRF'
    when 'delivery_challan' then 'DC'
    when 'sales_return'     then 'SRN'
    when 'credit_note'      then 'CRN'
    when 'purchase_return'  then 'PRN'
    when 'debit_note'       then 'DBN'
    when 'purchase_order'   then 'PO'
    else case when p_direction = 'purchase' then 'PUR' else null end
  end;

  if v_prefix is null then
    select coalesce(invoice_prefix, 'INV') into v_prefix
      from public."aimunim_tenants" where id = p_tenant_id;
  end if;

  v_fy := to_char(
            case when extract(month from current_date) >= 4
                 then current_date else current_date - interval '1 year' end,
            'YY')
        || to_char(
            case when extract(month from current_date) >= 4
                 then current_date + interval '1 year' else current_date end,
            'YY');

  return v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 5, '0');
end;
$$;

-- ============================================================================
-- SOURCE: supabase/migrations/0011_business_settings.sql
-- ============================================================================

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

-- ============================================================================
-- SOURCE: supabase/seed/seed.sql
-- ============================================================================

-- =============================================================================
-- Seed: one demo tenant ("Sharma Traders") with sample masters + transactions.
--
-- HOW TO USE
--   1. Run all migrations first (supabase db push, or paste each 000x file).
--   2. Sign up in the app (phone or email OTP) so an auth.users row exists.
--   3. Set `demo_email` below to that account's email, then run this file in
--      the Supabase SQL editor. It links the demo business to your user as
--      'owner', so you see it on login.
--
-- Safe to re-run: it upserts the demo tenant by a fixed UUID.
-- Runs as a privileged role in the SQL editor, so RLS does not block it.
-- =============================================================================

do $$
declare
  v_tenant  uuid := '11111111-1111-1111-1111-111111111111';
  v_user    uuid;
  demo_email text := 'mdzafareqbal@gmail.com';   -- <-- change to your login email

  v_cust1   uuid := '21111111-1111-1111-1111-111111111111';
  v_cust2   uuid := '22222222-2222-2222-2222-222222222222';
  v_supp1   uuid := '23333333-3333-3333-3333-333333333333';

  v_item1   uuid := '31111111-1111-1111-1111-111111111111';
  v_item2   uuid := '32222222-2222-2222-2222-222222222222';
  v_item3   uuid := '33333333-3333-3333-3333-333333333333';

  v_inv     uuid := '41111111-1111-1111-1111-111111111111';
begin
  -- ---- Tenant (Maharashtra, state code 27) ---------------------------------
  insert into public."aimunim_tenants"
    (id, name, legal_name, gstin, state_code, address_line1, city, state, pincode, phone, email, plan, invoice_prefix)
  values
    (v_tenant, 'Sharma Traders', 'Sharma Traders Pvt Ltd', '27ABCDE1234F1Z5', '27',
     'Shop 14, MG Road', 'Pune', 'Maharashtra', '411001', '9876543210',
     'owner@sharmatraders.test', 'trial', 'INV')
  on conflict (id) do update set name = excluded.name;

  insert into public."aimunim_subscriptions"
    (tenant_id, plan, status, trial_ends_at, current_period_start, current_period_end)
  values
    (v_tenant, 'trial', 'trialing', now() + interval '14 days', now(), now() + interval '14 days')
  on conflict (tenant_id) do nothing;

  -- ---- Link your logged-in user as owner (if it exists) --------------------
  select id into v_user from auth.users where email = demo_email limit 1;
  if v_user is not null then
    insert into public."aimunim_memberships" (tenant_id, user_id, role)
    values (v_tenant, v_user, 'owner')
    on conflict (tenant_id, user_id) do update set role = 'owner';
    raise notice 'Linked demo tenant to user %', demo_email;
  else
    raise notice 'No auth user for %. Sign up first, then re-run to link.', demo_email;
  end if;

  -- ---- Parties --------------------------------------------------------------
  -- Customer in Maharashtra (intra-state -> CGST+SGST)
  insert into public."aimunim_parties"
    (id, tenant_id, type, name, gstin, state_code, phone, billing_address)
  values
    (v_cust1, v_tenant, 'customer', 'Gupta Electronics', '27AAACG1234M1Z2', '27',
     '9811111111', 'FC Road, Pune, Maharashtra')
  on conflict (id) do nothing;

  -- Customer in Karnataka (inter-state -> IGST)
  insert into public."aimunim_parties"
    (id, tenant_id, type, name, gstin, state_code, phone, billing_address)
  values
    (v_cust2, v_tenant, 'customer', 'Reddy Hardware', '29AAACR5678K1Z9', '29',
     '9822222222', 'MG Road, Bengaluru, Karnataka')
  on conflict (id) do nothing;

  -- Supplier (Maharashtra)
  insert into public."aimunim_parties"
    (id, tenant_id, type, name, gstin, state_code, phone)
  values
    (v_supp1, v_tenant, 'supplier', 'Mahalaxmi Distributors', '27AAACM9999P1Z1', '27', '9833333333')
  on conflict (id) do nothing;

  -- ---- Items (prices in paise) ---------------------------------------------
  insert into public."aimunim_items"
    (id, tenant_id, type, name, sku, hsn_sac, unit, category, sale_price_paise, purchase_price_paise, tax_rate, stock_qty, low_stock_level)
  values
    (v_item1, v_tenant, 'product', 'LED Bulb 9W', 'LED-9W', '85395000', 'PCS', 'Lighting',
      9900, 6500, 12, 120, 20),
    (v_item2, v_tenant, 'product', 'Extension Board 4-Socket', 'EXT-4', '85366910', 'PCS', 'Accessories',
      24900, 18000, 18, 8, 10),     -- below low-stock level on purpose
    (v_item3, v_tenant, 'service', 'Electrician Visit', 'SVC-ELEC', '998719', 'HOUR', 'Service',
      30000, 0, 18, 0, 0)
  on conflict (id) do nothing;

  -- ---- A sample GST invoice (intra-state to Gupta Electronics) -------------
  -- 10 x LED Bulb @ ₹99 (12%) + 2 x Extension Board @ ₹249 (18%)
  -- Computed with the same rounding the app uses (see src/lib/gst.ts).
  insert into public."aimunim_invoices"
    (id, tenant_id, party_id, direction, invoice_type, invoice_number, invoice_date,
     place_of_supply_state, is_interstate,
     subtotal_paise, discount_paise, taxable_value_paise,
     cgst_paise, sgst_paise, igst_paise, total_tax_paise,
     additional_charges_paise, round_off_paise, total_paise, status, template)
  values
    (v_inv, v_tenant, v_cust1, 'sale', 'gst', 'INV/2526/00001', current_date,
     '27', false,
     148800, 0, 148800,         -- subtotal = 10*9900 + 2*24900 = 99000 + 49800 = 148800
     10422, 10422, 0, 20844,    -- CGST/SGST = (11880 + 8964)/2 = 10422 each; total tax 20844
     0, 0, 169644, 'unpaid', 'classic')  -- total = 148800 + 20844
  on conflict (id) do nothing;

  insert into public."aimunim_invoice_items"
    (tenant_id, invoice_id, item_id, line_no, name, hsn_sac, unit, qty, rate_paise,
     discount_percent, discount_paise, taxable_value_paise, tax_rate, cgst_paise, sgst_paise, igst_paise, amount_paise)
  values
    (v_tenant, v_inv, v_item1, 1, 'LED Bulb 9W', '85395000', 'PCS', 10, 9900,
     0, 0, 99000, 12, 5940, 5940, 0, 110880),
    (v_tenant, v_inv, v_item2, 2, 'Extension Board 4-Socket', '85366910', 'PCS', 2, 24900,
     0, 0, 49800, 18, 4482, 4482, 0, 58764)
  on conflict do nothing;

  -- ---- Stock out for the sale (drives current stock down) ------------------
  insert into public."aimunim_stock_movements"
    (tenant_id, item_id, qty_delta, type, reference_type, reference_id)
  values
    (v_tenant, v_item1, -10, 'sale', 'invoice', v_inv),
    (v_tenant, v_item2, -2,  'sale', 'invoice', v_inv)
  on conflict do nothing;

  -- ---- A partial payment received against the invoice ----------------------
  insert into public."aimunim_payments"
    (tenant_id, party_id, invoice_id, direction, amount_paise, mode, payment_date, reference)
  values
    (v_tenant, v_cust1, v_inv, 'in', 100000, 'upi', current_date, 'UPI-DEMO-001')
  on conflict do nothing;

  -- ---- A sample expense ----------------------------------------------------
  insert into public."aimunim_expenses"
    (tenant_id, category, amount_paise, expense_date, payment_mode, notes)
  values
    (v_tenant, 'Rent', 1500000, current_date, 'bank', 'Shop rent (demo)')
  on conflict do nothing;

  -- Balances/stock/invoice-status are maintained by triggers automatically.
  raise notice 'Seed complete for tenant % (Sharma Traders).', v_tenant;
end $$;

-- ============================================================================
-- SOURCE: supabase/seed/create_user.sql
-- ============================================================================

-- =============================================================================
-- create_user.sql — Manually create the two test users (email + password).
--
-- Two personas for testing while real OTP auth is disabled
-- (NEXT_PUBLIC_AUTH_DISABLED=true):
--
--   1. SUPER ADMIN  superadmin@aimunim.local / super123
--      Platform-level admin for the /admin panel. Belongs to no tenant.
--      (For real auth later, also add this email to SUPERADMIN_EMAILS in env.)
--
--   2. END USER     user@aimunim.local / user123
--      Normal business user; linked as 'owner' of the demo tenant
--      (Sharma Traders) so they see seeded data on login.
--
-- These rows in auth.users also make email+password sign-in work immediately
-- once real auth is re-enabled (NEXT_PUBLIC_AUTH_DISABLED=false).
--
-- Safe to re-run: existing users get their password reset instead.
-- Requires pgcrypto (enabled in migration 0001).
-- =============================================================================

do $$
declare
  v_tenant uuid := '11111111-1111-1111-1111-111111111111';  -- demo tenant id

  -- (email, password, tenant role or null for platform-only users)
  v_users constant jsonb := jsonb_build_array(
    jsonb_build_object('email', 'superadmin@aimunim.local', 'password', 'super123', 'tenant_role', null),
    jsonb_build_object('email', 'user@aimunim.local',       'password', 'user123',  'tenant_role', 'owner')
  );

  v_rec     jsonb;
  v_email   text;
  v_pass    text;
  v_role    text;
  v_user_id uuid;
begin
  for v_rec in select * from jsonb_array_elements(v_users) loop
    v_email := v_rec->>'email';
    v_pass  := v_rec->>'password';
    v_role  := v_rec->>'tenant_role';

    select id into v_user_id from auth.users where email = v_email;

    if v_user_id is null then
      v_user_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_user_id,
        'authenticated', 'authenticated',
        v_email, crypt(v_pass, gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        '', '', '', ''
      );

      -- Identity row is required for email/password sign-in to work.
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email),
        'email', v_user_id::text,
        now(), now(), now()
      );

      raise notice 'Created user % (id %)', v_email, v_user_id;
    else
      update auth.users
        set encrypted_password = crypt(v_pass, gen_salt('bf')),
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            updated_at = now()
        where id = v_user_id;
      raise notice 'User % already existed (id %); password reset.', v_email, v_user_id;
    end if;

    -- Link tenant-scoped users to the demo tenant.
    if v_role is not null then
      insert into public."aimunim_memberships" (tenant_id, user_id, role)
      values (v_tenant, v_user_id, v_role)
      on conflict (tenant_id, user_id) do update set role = excluded.role;
      raise notice 'Linked % to tenant % as %.', v_email, v_tenant, v_role;
    end if;
  end loop;
end $$;
