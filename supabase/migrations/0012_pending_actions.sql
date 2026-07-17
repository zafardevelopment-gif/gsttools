-- =============================================================================
-- aimunim_pending_actions — short-lived confirmation state for WhatsApp
-- billing (n8n). When the owner mentions an item that isn't in the Items
-- catalog, we ask "add karu?" over WhatsApp instead of silently adding it or
-- guessing. The reply (haan/nahi) resolves this row.
-- -----------------------------------------------------------------------------
create table public."aimunim_pending_actions" (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public."aimunim_tenants"(id) on delete cascade,
  phone        text not null,
  action       text not null,
  payload      jsonb not null,
  question     text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 minutes')
);

create index idx_pending_actions_lookup
  on public."aimunim_pending_actions"(tenant_id, phone, expires_at);

alter table public."aimunim_pending_actions" enable row level security;

create policy pending_actions_all on public."aimunim_pending_actions"
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
