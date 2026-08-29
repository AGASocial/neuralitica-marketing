-- US-1.1: Start guided business interview (Entrevista inicial)
-- neuramark_interview_sessions — one draft/completed JSON row per Cliente.
-- 1.1 writes status = 'draft' only. No neuramark_business_profiles.

CREATE TYPE public.neuramark_interview_session_status AS ENUM ('draft', 'completed');

CREATE TYPE public.neuramark_interview_step AS ENUM (
  'services',
  'zone',
  'tone',
  'offers',
  'objections',
  'style',
  'restrictions'
);

CREATE OR REPLACE FUNCTION public.neuramark_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.neuramark_interview_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL
                REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  status      public.neuramark_interview_session_status NOT NULL DEFAULT 'draft',
  current_step public.neuramark_interview_step NOT NULL DEFAULT 'services',
  answers     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_interview_sessions_answers_size_check
    CHECK (octet_length(answers::text) <= 81920)
);

CREATE UNIQUE INDEX neuramark_interview_sessions_client_id_idx
  ON public.neuramark_interview_sessions (client_id);

CREATE TRIGGER neuramark_interview_sessions_set_updated_at
  BEFORE UPDATE ON public.neuramark_interview_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_interview_sessions ENABLE ROW LEVEL SECURITY;
-- Zero policies. Service-role Node client bypasses RLS.
-- Do not add authenticated/anon ownership policies (no browser Supabase SDK).

COMMENT ON TABLE public.neuramark_interview_sessions IS
  'Entrevista inicial draft/completed JSON; one row per Cliente. 1.1 writes draft only.';
COMMENT ON COLUMN public.neuramark_interview_sessions.answers IS
  'Structured step object (seven keys). App gate 65536 UTF-8 bytes; CHECK 81920 slack.';
COMMENT ON COLUMN public.neuramark_interview_sessions.status IS
  'Server-written. US-1.1 draft only; US-1.3 may set completed.';
