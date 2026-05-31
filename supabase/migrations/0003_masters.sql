-- =============================================================================
-- 0003 — Master data: parties (customers/suppliers) and items (products/services)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GST_parties — customers and suppliers.
--
-- balance_paise: signed running outstanding, maintained by triggers in Step 7.
--   > 0  => party owes the business (receivable, typical for customers)
--   < 0  => business owes the party (payable, typical for suppliers)
-- opening_balance_paise uses the same sign convention.
-- -----------------------------------------------------------------------------
create table public."GST_parties" (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public."GST_tenants"(id) on delete cascade,
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

create index idx_parties_tenant on public."GST_parties"(tenant_id);
create index idx_parties_tenant_type on public."GST_parties"(tenant_id, type);
create index idx_parties_name on public."GST_parties"(tenant_id, lower(name));

create trigger trg_parties_updated_at
  before update on public."GST_parties"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- GST_items — products and services.
-- Prices in integer paise. tax_rate is percent (e.g. 18.00).
-- stock_qty allows fractional units (e.g. 2.500 kg). Services ignore stock.
-- -----------------------------------------------------------------------------
create table public."GST_items" (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public."GST_tenants"(id) on delete cascade,
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

create index idx_items_tenant on public."GST_items"(tenant_id);
create index idx_items_name on public."GST_items"(tenant_id, lower(name));
create index idx_items_hsn on public."GST_items"(tenant_id, hsn_sac);
-- Partial index to quickly surface low-stock products.
create index idx_items_low_stock on public."GST_items"(tenant_id)
  where type = 'product' and stock_qty <= low_stock_level;

create trigger trg_items_updated_at
  before update on public."GST_items"
  for each row execute function public.gst_set_updated_at();

-- =============================================================================
-- RLS — any member of the tenant may read/write its masters.
-- =============================================================================
alter table public."GST_parties" enable row level security;
alter table public."GST_items"   enable row level security;

create policy parties_select on public."GST_parties"
  for select using (public.is_tenant_member(tenant_id));
create policy parties_insert on public."GST_parties"
  for insert with check (public.is_tenant_member(tenant_id));
create policy parties_update on public."GST_parties"
  for update using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
create policy parties_delete on public."GST_parties"
  for delete using (public.is_tenant_member(tenant_id));

create policy items_select on public."GST_items"
  for select using (public.is_tenant_member(tenant_id));
create policy items_insert on public."GST_items"
  for insert with check (public.is_tenant_member(tenant_id));
create policy items_update on public."GST_items"
  for update using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
create policy items_delete on public."GST_items"
  for delete using (public.is_tenant_member(tenant_id));
