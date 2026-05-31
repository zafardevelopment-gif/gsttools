-- =============================================================================
-- 0002 — Core multi-tenancy: tenants, memberships, subscriptions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GST_tenants — one row per business.
-- -----------------------------------------------------------------------------
create table public."GST_tenants" (
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
  -- Denormalised current plan for quick gating; source of truth is GST_subscriptions.
  plan          text not null default 'trial'
                check (plan in ('trial','silver','gold','diamond')),
  invoice_prefix text not null default 'INV',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_tenants_updated_at
  before update on public."GST_tenants"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- GST_memberships — maps a user to a tenant with a role.
-- A user can belong to multiple tenants.
-- -----------------------------------------------------------------------------
create table public."GST_memberships" (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public."GST_tenants"(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'staff'
             check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index idx_memberships_user on public."GST_memberships"(user_id);
create index idx_memberships_tenant on public."GST_memberships"(tenant_id);

create trigger trg_memberships_updated_at
  before update on public."GST_memberships"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- GST_subscriptions — billing state per tenant.
-- -----------------------------------------------------------------------------
create table public."GST_subscriptions" (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public."GST_tenants"(id) on delete cascade,
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

create index idx_subscriptions_tenant on public."GST_subscriptions"(tenant_id);

create trigger trg_subscriptions_updated_at
  before update on public."GST_subscriptions"
  for each row execute function public.gst_set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public."GST_tenants"       enable row level security;
alter table public."GST_memberships"   enable row level security;
alter table public."GST_subscriptions" enable row level security;

-- --- GST_tenants -------------------------------------------------------------
create policy tenants_select on public."GST_tenants"
  for select using (public.is_tenant_member(id));

create policy tenants_insert on public."GST_tenants"
  for insert with check (auth.uid() is not null);

create policy tenants_update on public."GST_tenants"
  for update using (public.has_tenant_role(id, array['owner','admin']))
  with check (public.has_tenant_role(id, array['owner','admin']));

create policy tenants_delete on public."GST_tenants"
  for delete using (public.has_tenant_role(id, array['owner']));

-- --- GST_memberships ---------------------------------------------------------
-- Members can see all memberships of their tenants (to view the team).
create policy memberships_select on public."GST_memberships"
  for select using (public.is_tenant_member(tenant_id));

-- Only owner/admin can add/modify/remove members (first owner is created via
-- the SECURITY DEFINER provisioning RPC below, which bypasses RLS).
create policy memberships_insert on public."GST_memberships"
  for insert with check (public.has_tenant_role(tenant_id, array['owner','admin']));

create policy memberships_update on public."GST_memberships"
  for update using (public.has_tenant_role(tenant_id, array['owner','admin']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin']));

create policy memberships_delete on public."GST_memberships"
  for delete using (public.has_tenant_role(tenant_id, array['owner','admin']));

-- --- GST_subscriptions -------------------------------------------------------
create policy subscriptions_select on public."GST_subscriptions"
  for select using (public.is_tenant_member(tenant_id));

create policy subscriptions_modify on public."GST_subscriptions"
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

  insert into public."GST_tenants"
    (name, legal_name, gstin, state_code, address_line1, address_line2,
     city, state, pincode, phone, email, logo_path, plan)
  values
    (p_name, p_legal_name, p_gstin, p_state_code, p_address_line1, p_address_line2,
     p_city, p_state, p_pincode, p_phone, p_email, p_logo_path, 'trial')
  returning id into v_tenant_id;

  insert into public."GST_memberships" (tenant_id, user_id, role)
  values (v_tenant_id, v_uid, 'owner');

  insert into public."GST_subscriptions"
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
