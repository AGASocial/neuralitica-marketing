-- US-14.5: seed local operator neuramark_clients row.
-- Lookup auth.users by email only. NEVER write auth.users.
-- If Auth user is missing: NOTICE and skip (create the user via Dashboard
-- or Auth Admin API, then rerun the upsert in this COMMENT).
-- After this seed, neuramark_clients.active and role are operator-SQL only:
--   UPDATE public.neuramark_clients SET active = true WHERE email = '<email>';
--   UPDATE public.neuramark_clients SET role = 'operator' WHERE email = '<email>';
-- Inverse for deactivate / demote. No application UPDATE path.

COMMENT ON TABLE public.neuramark_clients IS
  'US-14.5: active/role are operator-SQL only after this seed.
   Rerunnable upsert when auth.users exists for gaveho@gmail.com:
   INSERT ... id = 00000000-0000-4000-8000-000000000001 on first insert;
   UPDATE active, role, display_name, auth_user_id; never rewrite id.';

COMMENT ON COLUMN public.neuramark_clients.active IS
  'SQL-only activation by operator; no app UPDATE path (US-14.1/14.5).
   UPDATE public.neuramark_clients SET active = true WHERE email = ''<email>'';
   Inverse: SET active = false.';

COMMENT ON COLUMN public.neuramark_clients.role IS
  'SQL-only promotion to operator; never accepted from auth requests.
   UPDATE public.neuramark_clients SET role = ''operator'' WHERE email = ''<email>'';
   Inverse: SET role = ''client''.';

DO $$
DECLARE
  found_auth_id uuid;
BEGIN
  SELECT id INTO found_auth_id
  FROM auth.users
  WHERE email = 'gaveho@gmail.com'
  LIMIT 1;

  IF found_auth_id IS NULL THEN
    RAISE NOTICE
      'US-14.5 seed skipped: no auth.users row for gaveho@gmail.com. Create the Auth user (Dashboard or Auth Admin API, email confirmed), then rerun the upsert documented on neuramark_clients.';
    RETURN;
  END IF;

  INSERT INTO public.neuramark_clients (
    id,
    auth_user_id,
    email,
    display_name,
    preferred_locale,
    active,
    role
  ) VALUES (
    '00000000-0000-4000-8000-000000000001',
    found_auth_id,
    'gaveho@gmail.com',
    'Gabriel Vega',
    'en',
    true,
    'operator'
  )
  ON CONFLICT (email) DO UPDATE
    SET
      auth_user_id = EXCLUDED.auth_user_id,
      display_name = EXCLUDED.display_name,
      active = true,
      role = 'operator';
      -- do NOT set id (preserve existing PK / future FKs)
END $$;
