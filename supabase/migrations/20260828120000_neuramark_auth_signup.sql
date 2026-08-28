-- US-14.1: Sign up with email and password
-- neuramark_clients, neuramark_auth_attempts, role/action enums

CREATE TYPE public.neuramark_client_role AS ENUM ('client', 'operator');

CREATE TYPE public.neuramark_auth_action AS ENUM (
  'signup',
  'resend_confirmation',
  'login_failed',
  'password_reset_request'
);

CREATE TABLE public.neuramark_clients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id     uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  email            text NOT NULL,
  display_name     text NOT NULL,
  preferred_locale text NOT NULL DEFAULT 'en'
    CONSTRAINT neuramark_clients_preferred_locale_check
    CHECK (preferred_locale IN ('en', 'es')),
  active           boolean NOT NULL DEFAULT false,
  role             public.neuramark_client_role NOT NULL DEFAULT 'client',
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_clients_email_unique UNIQUE (email),
  CONSTRAINT neuramark_clients_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 120)
);

CREATE INDEX neuramark_clients_active_idx
  ON public.neuramark_clients (active);

CREATE INDEX neuramark_clients_role_idx
  ON public.neuramark_clients (role);

COMMENT ON COLUMN public.neuramark_clients.active IS
  'SQL-only activation by operator; no app UPDATE path (US-14.1/14.5).';

COMMENT ON COLUMN public.neuramark_clients.role IS
  'SQL-only promotion to operator; never accepted from auth requests.';

CREATE TABLE public.neuramark_auth_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash      text NOT NULL,
  email_hash   text,
  action       public.neuramark_auth_action NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_auth_attempts_ip_action_time_idx
  ON public.neuramark_auth_attempts (ip_hash, action, attempted_at DESC);

CREATE INDEX neuramark_auth_attempts_email_action_time_idx
  ON public.neuramark_auth_attempts (email_hash, action, attempted_at DESC)
  WHERE email_hash IS NOT NULL;
