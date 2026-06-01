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

-- Helper functions below reference GST_memberships, which is created later in
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
-- SECURITY DEFINER so it can read GST_memberships without recursively invoking
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
  from public."GST_memberships" m
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
    from public."GST_memberships" m
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
    from public."GST_memberships" m
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
