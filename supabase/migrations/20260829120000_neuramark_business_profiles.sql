-- US-1.3: Submit Entrevista → Ficha viva (neuramark_business_profiles)
-- One profile per Cliente; UNIQUE(source_interview_id) for submit idempotency.
-- RLS deny-by-default; service-role Node only (match interview sessions).

CREATE TABLE public.neuramark_business_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL
                         REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  source_interview_id  uuid NOT NULL
                         REFERENCES public.neuramark_interview_sessions (id) ON DELETE RESTRICT,
  fields               jsonb NOT NULL,
  version              integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_business_profiles_fields_size_check
    CHECK (octet_length(fields::text) <= 81920),
  CONSTRAINT neuramark_business_profiles_version_positive
    CHECK (version >= 1)
);

-- V1: one Ficha viva per Cliente
CREATE UNIQUE INDEX neuramark_business_profiles_client_id_idx
  ON public.neuramark_business_profiles (client_id);

-- AC [SEC]: idempotency per source Entrevista
CREATE UNIQUE INDEX neuramark_business_profiles_source_interview_id_idx
  ON public.neuramark_business_profiles (source_interview_id);

CREATE TRIGGER neuramark_business_profiles_set_updated_at
  BEFORE UPDATE ON public.neuramark_business_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_business_profiles ENABLE ROW LEVEL SECURITY;
-- Zero policies. Service-role Node client bypasses RLS.
-- Do not add authenticated/anon ownership policies (no browser Supabase SDK).

COMMENT ON TABLE public.neuramark_business_profiles IS
  'Ficha viva; one row per Cliente. Created/updated on Entrevista submit (US-1.3).';
COMMENT ON COLUMN public.neuramark_business_profiles.fields IS
  'jsonb mirroring interview answer keys (services…restrictions). App validates via completeness Zod.';
COMMENT ON COLUMN public.neuramark_business_profiles.source_interview_id IS
  'Server-set FK to neuramark_interview_sessions.id; UNIQUE for submit idempotency.';

-- Fail-closed: upsert profile then mark completed in one transaction.
CREATE OR REPLACE FUNCTION public.neuramark_complete_interview_with_profile(
  p_client_id uuid,
  p_session_id uuid,
  p_fields jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.neuramark_interview_session_status;
  v_version integer;
BEGIN
  SELECT s.status INTO v_status
  FROM public.neuramark_interview_sessions s
  WHERE s.id = p_session_id
    AND s.client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.neuramark_business_profiles (
    client_id,
    source_interview_id,
    fields,
    version
  )
  VALUES (
    p_client_id,
    p_session_id,
    p_fields,
    1
  )
  ON CONFLICT (client_id) DO UPDATE
    SET
      fields = EXCLUDED.fields,
      source_interview_id = EXCLUDED.source_interview_id,
      version = public.neuramark_business_profiles.version + 1,
      updated_at = now()
  RETURNING version INTO v_version;

  UPDATE public.neuramark_interview_sessions
  SET
    status = 'completed',
    updated_at = now()
  WHERE client_id = p_client_id
    AND id = p_session_id
    AND status IN ('draft', 'completed');

  RETURN jsonb_build_object(
    'version', v_version,
    'alreadyCompleted', (v_status = 'completed')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.neuramark_complete_interview_with_profile(uuid, uuid, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.neuramark_complete_interview_with_profile(uuid, uuid, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.neuramark_complete_interview_with_profile(uuid, uuid, jsonb) IS
  'US-1.3: atomic profile upsert then interview status=completed (fail-closed).';
