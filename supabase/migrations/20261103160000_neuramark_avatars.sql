-- Avatar presenter identity: gender, language, optional ElevenLabs clone voice_id.
-- One row per client (V1). Scripts/TTS resolve language + voice from this record.

CREATE TABLE public.neuramark_avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  gender text NOT NULL
    CONSTRAINT neuramark_avatars_gender_check
      CHECK (gender IN ('male', 'female')),
  language text NOT NULL
    CONSTRAINT neuramark_avatars_language_check
      CHECK (language IN ('en', 'es')),
  elevenlabs_voice_id text NULL
    CONSTRAINT neuramark_avatars_elevenlabs_voice_id_check
      CHECK (
        elevenlabs_voice_id IS NULL
        OR (
          char_length(elevenlabs_voice_id) >= 10
          AND char_length(elevenlabs_voice_id) <= 64
          AND elevenlabs_voice_id ~ '^[A-Za-z0-9_-]+$'
        )
      ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_avatars_client_id_unique UNIQUE (client_id)
);

CREATE TRIGGER neuramark_avatars_set_updated_at
  BEFORE UPDATE ON public.neuramark_avatars
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_avatars ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated.
-- Access only via service-role Node (Next.js backend).

COMMENT ON TABLE public.neuramark_avatars IS
  'Presenter avatar config per client: gender, language (en|es), optional ElevenLabs voice_id clone.';
COMMENT ON COLUMN public.neuramark_avatars.gender IS
  'Presenter gender for TTS voice mapping and script grammar (male|female).';
COMMENT ON COLUMN public.neuramark_avatars.language IS
  'Script + TTS language forced for this avatar (en|es).';
COMMENT ON COLUMN public.neuramark_avatars.elevenlabs_voice_id IS
  'Optional custom/cloned ElevenLabs voice id; when set, overrides catalog mapping.';

-- Test operator client: male Spanish presenter with Gabriel de Caracas clone.
-- Only when the seeded client row exists (US-14.5 may skip if Auth user missing).
INSERT INTO public.neuramark_avatars (
  client_id,
  gender,
  language,
  elevenlabs_voice_id
)
SELECT
  c.id,
  'male',
  'es',
  'ulhSmqhbTnrunZUQjKqA'
FROM public.neuramark_clients c
WHERE c.id = '00000000-0000-4000-8000-000000000001'
ON CONFLICT (client_id) DO UPDATE
SET
  gender = EXCLUDED.gender,
  language = EXCLUDED.language,
  elevenlabs_voice_id = EXCLUDED.elevenlabs_voice_id,
  updated_at = now();

-- Align Preferencias catalog voice with male Spanish when a prefs row exists.
UPDATE public.neuramark_visual_preferences
SET
  voice_id = 'es_professional_male',
  updated_at = now()
WHERE client_id = '00000000-0000-4000-8000-000000000001';
