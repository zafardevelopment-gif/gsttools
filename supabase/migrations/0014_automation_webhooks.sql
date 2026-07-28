-- =============================================================================
-- 0014 — Outbound events: webhooks + delivery log
-- =============================================================================
-- 0013 gave n8n a way to push data IN. This is the other direction: AI Munim
-- tells n8n that something happened (bill bana, payment aayi, stock khatam),
-- so a workflow can send the WhatsApp reminder or the daily report.
--
-- Design note — why a table and not a direct HTTP call:
-- delivery must never block or slow a user-facing request. Saving an invoice
-- cannot wait on someone's n8n instance being up. So the emitting code only
-- does one INSERT into aimunim_automation_events; delivery happens after the
-- response is sent, and anything that fails is retried by the cron sweep.
-- This is a transactional outbox, and it is the reason a dead webhook endpoint
-- can never make billing feel slow.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- aimunim_automation_events — the outbox. One row per thing that happened.
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_automation_events" (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public."aimunim_tenants"(id) on delete cascade,
  event_type  text not null,
  entity_type text,
  entity_id   uuid,
  -- Everything a workflow needs to act without calling back for more data.
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_automation_events_tenant
  on public."aimunim_automation_events"(tenant_id, created_at desc);

-- -----------------------------------------------------------------------------
-- aimunim_automation_webhooks — where to send them.
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_automation_webhooks" (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public."aimunim_tenants"(id) on delete cascade,
  label       text not null default 'n8n',
  target_url  text not null,
  -- Shown in the UI so the receiver can verify signatures. Not a password:
  -- it is a shared secret the customer must be able to read and paste into n8n.
  secret      text not null,
  -- Event types this endpoint wants. Empty array = everything.
  events      text[] not null default '{}',
  is_active   boolean not null default true,
  -- Auto-disable guard: a dead endpoint should stop being retried forever.
  consecutive_failures integer not null default 0,
  last_success_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_automation_webhooks_tenant
  on public."aimunim_automation_webhooks"(tenant_id);

drop trigger if exists trg_automation_webhooks_updated_at
  on public."aimunim_automation_webhooks";
create trigger trg_automation_webhooks_updated_at
  before update on public."aimunim_automation_webhooks"
  for each row execute function public.gst_set_updated_at();

-- -----------------------------------------------------------------------------
-- aimunim_automation_deliveries — one row per attempt, per webhook, per event.
--
-- Kept per-attempt rather than per-event so the Activity Log can show "tried 3
-- times, got 500 each time" instead of a single opaque "failed".
-- -----------------------------------------------------------------------------
create table if not exists public."aimunim_automation_deliveries" (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public."aimunim_tenants"(id) on delete cascade,
  webhook_id    uuid not null references public."aimunim_automation_webhooks"(id) on delete cascade,
  event_id      uuid not null references public."aimunim_automation_events"(id) on delete cascade,
  attempt       integer not null default 1,
  status        text not null default 'pending'
                check (status in ('pending','succeeded','failed')),
  response_code integer,
  error         text,
  -- NULL once the delivery is settled (succeeded, or out of attempts).
  next_retry_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The cron sweep's query: everything due for another attempt.
create index if not exists idx_automation_deliveries_due
  on public."aimunim_automation_deliveries"(next_retry_at)
  where next_retry_at is not null;

create index if not exists idx_automation_deliveries_tenant
  on public."aimunim_automation_deliveries"(tenant_id, created_at desc);

-- One attempt row per (webhook, event, attempt) — makes the retry loop
-- naturally idempotent even if the sweep runs twice.
create unique index if not exists uq_automation_delivery_attempt
  on public."aimunim_automation_deliveries"(webhook_id, event_id, attempt);

drop trigger if exists trg_automation_deliveries_updated_at
  on public."aimunim_automation_deliveries";
create trigger trg_automation_deliveries_updated_at
  before update on public."aimunim_automation_deliveries"
  for each row execute function public.gst_set_updated_at();

-- =============================================================================
-- RLS — same pattern as 0013
-- =============================================================================
alter table public."aimunim_automation_events"     enable row level security;
alter table public."aimunim_automation_webhooks"   enable row level security;
alter table public."aimunim_automation_deliveries" enable row level security;

-- Webhooks carry a secret, so they follow the API-key rule: owners/admins only.
drop policy if exists automation_webhooks_all on public."aimunim_automation_webhooks";
create policy automation_webhooks_all on public."aimunim_automation_webhooks"
  for all using (public.has_tenant_role(tenant_id, array['owner','admin']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin']));

-- Events and deliveries are read-only history for any member of the tenant.
drop policy if exists automation_events_read on public."aimunim_automation_events";
create policy automation_events_read on public."aimunim_automation_events"
  for select using (public.is_tenant_member(tenant_id));

drop policy if exists automation_deliveries_read on public."aimunim_automation_deliveries";
create policy automation_deliveries_read on public."aimunim_automation_deliveries"
  for select using (public.is_tenant_member(tenant_id));
