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
