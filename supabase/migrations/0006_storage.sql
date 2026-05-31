-- =============================================================================
-- 0006 — Storage: business logos bucket
-- =============================================================================
-- Logos are stored under a path namespaced by tenant id: `<tenant_id>/logo.<ext>`.
-- Access is restricted so a user can only read/write objects of tenants they
-- belong to. The bucket is public-read for rendering logos on shared invoices.

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Helper: first path segment of an object name is the tenant id.
-- storage.foldername(name) returns text[]; element 1 is the top folder.

-- Read: public (so logos render on shared/printed invoices).
create policy "logos_public_read"
  on storage.objects for select
  using (bucket_id = 'logos');

-- Write/update/delete: only members of the tenant that owns the folder.
create policy "logos_member_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "logos_member_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'logos'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "logos_member_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );
