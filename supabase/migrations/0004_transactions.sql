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
