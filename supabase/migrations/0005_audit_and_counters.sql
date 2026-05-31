-- =============================================================================
-- 0005 — Audit log + atomic invoice-number generator
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GST_audit_logs — lightweight activity trail.
-- -----------------------------------------------------------------------------
create table public."GST_audit_logs" (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public."GST_tenants"(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,                 -- e.g. 'invoice.created'
  entity_type text,                           -- e.g. 'invoice'
  entity_id   uuid,
  data        jsonb,
  created_at  timestamptz not null default now()
);

create index idx_audit_tenant_date on public."GST_audit_logs"(tenant_id, created_at desc);

alter table public."GST_audit_logs" enable row level security;

-- Owners/admins can read the trail; any member can append their own actions.
create policy audit_select on public."GST_audit_logs"
  for select using (public.has_tenant_role(tenant_id, array['owner','admin']));
create policy audit_insert on public."GST_audit_logs"
  for insert with check (public.is_tenant_member(tenant_id));

-- -----------------------------------------------------------------------------
-- GST_invoice_counters — per (tenant, direction) running sequence so invoice
-- numbers never collide under concurrency.
-- -----------------------------------------------------------------------------
create table public."GST_invoice_counters" (
  tenant_id uuid not null references public."GST_tenants"(id) on delete cascade,
  direction text not null check (direction in ('sale','purchase')),
  last_seq  bigint not null default 0,
  primary key (tenant_id, direction)
);

alter table public."GST_invoice_counters" enable row level security;
create policy invoice_counters_select on public."GST_invoice_counters"
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

  insert into public."GST_invoice_counters" (tenant_id, direction, last_seq)
  values (p_tenant_id, p_direction, 1)
  on conflict (tenant_id, direction)
  do update set last_seq = public."GST_invoice_counters".last_seq + 1
  returning last_seq into v_seq;

  if p_direction = 'purchase' then
    v_prefix := 'PUR';
  else
    select coalesce(invoice_prefix, 'INV') into v_prefix
      from public."GST_tenants" where id = p_tenant_id;
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
