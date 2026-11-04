-- Reel duration policies by modality family (avatar vs faceless).
-- Single data-driven source for script clamp, TTS validation, avatar segment
-- split, HeyGen job duration, and assembly cutaways.
-- RLS deny-by-default; service-role Node only.

CREATE TABLE public.neuramark_reel_duration_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modality_key text NOT NULL
    CONSTRAINT neuramark_reel_duration_policies_modality_key_chk
      CHECK (modality_key IN ('avatar', 'faceless')),
  target_duration_sec_min integer NOT NULL
    CONSTRAINT neuramark_reel_duration_policies_min_positive_chk
      CHECK (target_duration_sec_min > 0),
  target_duration_sec_max integer NOT NULL
    CONSTRAINT neuramark_reel_duration_policies_max_positive_chk
      CHECK (target_duration_sec_max > 0),
  avatar_segment_max_sec integer NULL
    CONSTRAINT neuramark_reel_duration_policies_segment_max_positive_chk
      CHECK (
        avatar_segment_max_sec IS NULL
        OR avatar_segment_max_sec > 0
      ),
  avatar_segments_min integer NULL
    CONSTRAINT neuramark_reel_duration_policies_segments_min_chk
      CHECK (
        avatar_segments_min IS NULL
        OR avatar_segments_min >= 1
      ),
  avatar_segments_max integer NULL
    CONSTRAINT neuramark_reel_duration_policies_segments_max_chk
      CHECK (
        avatar_segments_max IS NULL
        OR avatar_segments_max >= 1
      ),
  broll_cutaways_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_reel_duration_policies_modality_key_unique
    UNIQUE (modality_key),
  CONSTRAINT neuramark_reel_duration_policies_min_le_max_chk
    CHECK (target_duration_sec_min <= target_duration_sec_max),
  CONSTRAINT neuramark_reel_duration_policies_avatar_fields_chk
    CHECK (
      (
        modality_key = 'avatar'
        AND avatar_segment_max_sec IS NOT NULL
        AND avatar_segments_min IS NOT NULL
        AND avatar_segments_max IS NOT NULL
        AND avatar_segments_min <= avatar_segments_max
        AND avatar_segment_max_sec <= target_duration_sec_max
      )
      OR (
        modality_key = 'faceless'
        AND avatar_segment_max_sec IS NULL
        AND avatar_segments_min IS NULL
        AND avatar_segments_max IS NULL
      )
    )
);

CREATE TRIGGER neuramark_reel_duration_policies_set_updated_at
  BEFORE UPDATE ON public.neuramark_reel_duration_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_reel_duration_policies ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default; service-role Node only.

COMMENT ON TABLE public.neuramark_reel_duration_policies IS
  'Modality-keyed reel duration bounds: avatar 8–15s with 1–2 ≤8s segments + b-roll cutaways; faceless 15–45s.';
COMMENT ON COLUMN public.neuramark_reel_duration_policies.modality_key IS
  'Policy family: avatar covers own_avatar + generic_avatar; faceless covers B-roll / sin presencia.';
COMMENT ON COLUMN public.neuramark_reel_duration_policies.avatar_segment_max_sec IS
  'Max seconds per talking-head lip-sync clip (HeyGen segment). Null for faceless.';
COMMENT ON COLUMN public.neuramark_reel_duration_policies.broll_cutaways_allowed IS
  'When true, assembly may insert b-roll cutaways between avatar segments / mid-clip.';

INSERT INTO public.neuramark_reel_duration_policies (
  modality_key,
  target_duration_sec_min,
  target_duration_sec_max,
  avatar_segment_max_sec,
  avatar_segments_min,
  avatar_segments_max,
  broll_cutaways_allowed
) VALUES
  (
    'avatar',
    8,
    15,
    8,
    1,
    2,
    true
  ),
  (
    'faceless',
    15,
    45,
    NULL,
    NULL,
    NULL,
    false
  );
