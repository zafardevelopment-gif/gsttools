-- =============================================================================
-- create_user.sql — Manually create the two test users (email + password).
--
-- Two personas for testing while real OTP auth is disabled
-- (NEXT_PUBLIC_AUTH_DISABLED=true):
--
--   1. SUPER ADMIN  superadmin@aimunim.local / super123
--      Platform-level admin for the /admin panel. Belongs to no tenant.
--      (For real auth later, also add this email to SUPERADMIN_EMAILS in env.)
--
--   2. END USER     user@aimunim.local / user123
--      Normal business user; linked as 'owner' of the demo tenant
--      (Sharma Traders) so they see seeded data on login.
--
-- These rows in auth.users also make email+password sign-in work immediately
-- once real auth is re-enabled (NEXT_PUBLIC_AUTH_DISABLED=false).
--
-- Safe to re-run: existing users get their password reset instead.
-- Requires pgcrypto (enabled in migration 0001).
-- =============================================================================

do $$
declare
  v_tenant uuid := '11111111-1111-1111-1111-111111111111';  -- demo tenant id

  -- (email, password, tenant role or null for platform-only users)
  v_users constant jsonb := jsonb_build_array(
    jsonb_build_object('email', 'superadmin@aimunim.local', 'password', 'super123', 'tenant_role', null),
    jsonb_build_object('email', 'user@aimunim.local',       'password', 'user123',  'tenant_role', 'owner')
  );

  v_rec     jsonb;
  v_email   text;
  v_pass    text;
  v_role    text;
  v_user_id uuid;
begin
  for v_rec in select * from jsonb_array_elements(v_users) loop
    v_email := v_rec->>'email';
    v_pass  := v_rec->>'password';
    v_role  := v_rec->>'tenant_role';

    select id into v_user_id from auth.users where email = v_email;

    if v_user_id is null then
      v_user_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_user_id,
        'authenticated', 'authenticated',
        v_email, crypt(v_pass, gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        '', '', '', ''
      );

      -- Identity row is required for email/password sign-in to work.
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email),
        'email', v_user_id::text,
        now(), now(), now()
      );

      raise notice 'Created user % (id %)', v_email, v_user_id;
    else
      update auth.users
        set encrypted_password = crypt(v_pass, gen_salt('bf')),
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            updated_at = now()
        where id = v_user_id;
      raise notice 'User % already existed (id %); password reset.', v_email, v_user_id;
    end if;

    -- Link tenant-scoped users to the demo tenant.
    if v_role is not null then
      insert into public."aimunim_memberships" (tenant_id, user_id, role)
      values (v_tenant, v_user_id, v_role)
      on conflict (tenant_id, user_id) do update set role = excluded.role;
      raise notice 'Linked % to tenant % as %.', v_email, v_tenant, v_role;
    end if;
  end loop;
end $$;
