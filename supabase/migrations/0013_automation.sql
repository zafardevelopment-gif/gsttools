-- =============================================================================
-- 0013 — Automation surface: per-tenant API keys + idempotent ingest
-- =============================================================================
-- Replaces the single global INTERNAL_API_TOKEN used by /api/internal, where
-- tenant_id arrived in the request body — meaning any holder of that one token
-- could read or write ANY tenant's data. Here a key resolves to exactly one
-- tenant and the caller never names a tenant at all.
--
-- Conventions kept from 0001: aimunim_ prefix, tenant_id on every row, RLS via
-- is_tenant_member(), integer paise, updated_at trigger.
--
-- NOTE on RLS and API keys: an API-key request has no Supabase session, so
-- auth.uid() is NULL and is_tenant_member() is false for every row. The ingest
-- routes therefore run on the service-role client and isolation is enforced in
-- application code (the key → tenant lookup is the only source of tenant_id;
-- it is never read from the request). The policies below still apply to the UI,
-- which reads these tables through the normal RLS client.
-- =============================================================================

-- Feature flag: the whole automation surface is off until switched on per
-- tenant. A real column rather than a key inside invoice_settings jsonb,
-- because it is a security boundary and wants to be indexable and constrained.
alter table public."aimunim_tenants"
  add column if not exists automation_enabled boolean not null default false;

-- -----------------------------------------------------------------------------
-- aimunim_automation_api_keys
--
-- key_hash is SHA-256 of the full key. The key itself is high-entropy random
-- (256 bits), not a user-chosen password, so a fast hash is the correct choice:
-- bcrypt/argon2 would force a table scan comparing every row on every request,
-- while SHA-256 allows a single indexed lookup. This is what Stripe/GitHub do.
-- The plaintext key is shown to the user exactly once and never stored.
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_automation_api_keys" (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public."aimunim_tenants"(id) on delete cascade,
  label        text not null,
  key_hash     text not null unique,
  -- Displayable, non-secret head of the key, e.g. "amk_live_9f2c…".
  key_prefix   text not null,
  scopes       text[] not null default '{read,write}',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_automation_keys_tenant
  on public."aimunim_automation_api_keys"(tenant_id);
-- Partial index: the auth hot path only ever looks up live keys.
create index if not exists idx_automation_keys_live
  on public."aimunim_automation_api_keys"(key_hash)
  where revoked_at is null;

drop trigger if exists trg_automation_keys_updated_at
  on public."aimunim_automation_api_keys";
create trigger trg_automation_keys_updated_at
  before update on public."aimunim_automation_api_keys"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- aimunim_automation_ingest_log
--
-- Idempotency ledger AND activity trail in one table. n8n retries on any
-- network blip, so every write endpoint requires an Idempotency-Key; the
-- unique index below is the lock. A replayed key returns the stored response
-- instead of creating a second invoice.
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_automation_ingest_log" (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public."aimunim_tenants"(id) on delete cascade,
  api_key_id      uuid references public."aimunim_automation_api_keys"(id) on delete set null,
  idempotency_key text not null,
  endpoint        text not null,
  -- SHA-256 of the request body: lets us detect the same key being reused with
  -- different content, which is a client bug worth surfacing rather than
  -- silently returning the first response.
  request_hash    text not null,
  status          text not null default 'pending'
                  check (status in ('pending','succeeded','failed')),
  entity_type     text,
  entity_id       uuid,
  -- Stored response, replayed verbatim on a duplicate key.
  response        jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The idempotency guarantee. Scoped per tenant so two tenants can
-- independently use the same key value.
create unique index if not exists uq_automation_ingest_idem
  on public."aimunim_automation_ingest_log"(tenant_id, idempotency_key);

create index if not exists idx_automation_ingest_recent
  on public."aimunim_automation_ingest_log"(tenant_id, created_at desc);

drop trigger if exists trg_automation_ingest_updated_at
  on public."aimunim_automation_ingest_log";
create trigger trg_automation_ingest_updated_at
  before update on public."aimunim_automation_ingest_log"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- aimunim_automation_rate_limits — fixed-window counter per key.
--
-- There is no Redis in this stack and the app may run serverless, where an
-- in-process counter is meaningless (every request can be a fresh instance).
-- A tiny Postgres table hit through one atomic upsert is the honest option.
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_automation_rate_limits" (
  api_key_id   uuid not null references public."aimunim_automation_api_keys"(id) on delete cascade,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (api_key_id, window_start)
);

-- -----------------------------------------------------------------------------
-- gst_automation_rate_limit_hit(key, window_seconds) -> hits so far in window
--
-- One atomic statement: the INSERT … ON CONFLICT DO UPDATE … RETURNING both
-- increments and reads under the row lock, so concurrent requests cannot both
-- see the same count.
-- -----------------------------------------------------------------------------
create or replace function public.gst_automation_rate_limit_hit(
  p_api_key_id uuid,
  p_window_seconds integer default 60
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  -- Snap now() down to the start of the current fixed window.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public."aimunim_automation_rate_limits" (api_key_id, window_start, hits)
  values (p_api_key_id, v_window, 1)
  on conflict (api_key_id, window_start)
  do update set hits = public."aimunim_automation_rate_limits".hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup: drop this key's windows older than an hour.
  delete from public."aimunim_automation_rate_limits"
   where api_key_id = p_api_key_id
     and window_start < now() - interval '1 hour';

  return v_hits;
end;
$$;

revoke all on function public.gst_automation_rate_limit_hit(uuid, integer) from public;
grant execute on function public.gst_automation_rate_limit_hit(uuid, integer) to authenticated;

-- =============================================================================
-- RLS — same pattern as every other tenant table (0003 / 0004)
-- =============================================================================
alter table public."aimunim_automation_api_keys"    enable row level security;
alter table public."aimunim_automation_ingest_log"  enable row level security;
alter table public."aimunim_automation_rate_limits" enable row level security;

-- Keys are managed by owners/admins only: a salesman with a login should not
-- be able to mint a credential that bypasses their own role restrictions.
drop policy if exists automation_keys_all on public."aimunim_automation_api_keys";
create policy automation_keys_all on public."aimunim_automation_api_keys"
  for all using (public.has_tenant_role(tenant_id, array['owner','admin']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin']));

-- The activity log is readable by any member of the tenant; writes only ever
-- happen from the service-role ingest path.
drop policy if exists automation_ingest_read on public."aimunim_automation_ingest_log";
create policy automation_ingest_read on public."aimunim_automation_ingest_log"
  for select using (public.is_tenant_member(tenant_id));

-- No policy grants access to the rate-limit table: it is service-role only.
-- RLS is enabled so that the anon/authenticated roles get nothing by default.
