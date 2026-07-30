-- =============================================================================
-- 0015 — Bill scanning: scan a purchase/expense/other bill (camera or file),
-- extract vendor/amount/date via AI vision, let the owner review, then save.
-- =============================================================================
-- Flow:
--   1. Image uploaded to the private `bill-scans` bucket
--      (`<tenant_id>/<scan_id>.<ext>`).
--   2. AI extraction result stored as a 'pending' row for the owner to review.
--   3. On confirm, status -> 'confirmed' and (for purchase/expense) a linked
--      aimunim_expenses row is created — expense_id points back to it so the
--      two stay in sync and reports keep working unchanged.

create table public."aimunim_bill_scans" (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public."aimunim_tenants"(id) on delete cascade,
  type           text not null default 'expense'
                 check (type in ('purchase','expense','other')),
  status         text not null default 'pending'
                 check (status in ('pending','confirmed','failed')),
  image_path     text not null,
  vendor_name    text,
  bill_date      date,
  amount_paise   bigint check (amount_paise is null or amount_paise >= 0),
  category       text,
  notes          text,
  raw_extracted  jsonb,
  ai_error       text,
  expense_id     uuid references public."aimunim_expenses"(id) on delete set null,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_bill_scans_tenant on public."aimunim_bill_scans"(tenant_id, created_at desc);

create trigger set_updated_at
  before update on public."aimunim_bill_scans"
  for each row execute function public.set_updated_at();

alter table public."aimunim_bill_scans" enable row level security;

create policy bill_scans_all on public."aimunim_bill_scans"
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- -----------------------------------------------------------------------------
-- Storage: private bucket for the scanned bill photos.
-- Path convention: `<tenant_id>/<scan_id>.<ext>` — same tenant-folder pattern
-- as the `logos` bucket (0006), but NOT public since bills carry business
-- financial data. Access is served via short-lived signed URLs.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bill-scans', 'bill-scans', false)
on conflict (id) do nothing;

create policy "bill_scans_member_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bill-scans'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "bill_scans_member_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bill-scans'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "bill_scans_member_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'bill-scans'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );
