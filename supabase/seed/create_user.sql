-- =============================================================================
-- create_user.sql — Manually create a login-able user (email + password).
--
-- This is the "signup" you run by hand while the in-app OTP signup is disabled.
-- It writes a confirmed user into Supabase's auth.users (+ auth.identities) and
-- links them to the demo tenant as 'owner', so they can log in immediately with
-- email + password once real auth is re-enabled (NEXT_PUBLIC_AUTH_DISABLED=false).
--
-- HOW TO USE
--   1. Edit v_email / v_password below.
--   2. Run this whole file in the Supabase SQL editor (it runs as a privileged
--      role, so it can write to the auth schema).
--   3. Re-run any time with a different email to add more users.
--
-- Requires the pgcrypto extension (already enabled in migration 0001).
-- =============================================================================

do $$
declare
  v_email    text := 'admin@gst.local';   -- <-- login email
  v_password text := 'admin123';           -- <-- login password
  v_tenant   uuid := '11111111-1111-1111-1111-111111111111';  -- demo tenant id
  v_role     text := 'owner';              -- owner | accountant | staff
  v_user_id  uuid;
begin
  -- Reuse the user if this email already exists, otherwise create them.
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
      v_email, crypt(v_password, gen_salt('bf')),
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
    -- Update the password so you always know the credentials.
    update auth.users
      set encrypted_password = crypt(v_password, gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = v_user_id;
    raise notice 'User % already existed (id %); password reset.', v_email, v_user_id;
  end if;

  -- Link the user to the demo tenant so they see data on login.
  insert into public."GST_memberships" (tenant_id, user_id, role)
  values (v_tenant, v_user_id, v_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role;

  raise notice 'Linked % to tenant % as %.', v_email, v_tenant, v_role;
end $$;
