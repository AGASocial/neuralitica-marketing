-- HeyGen DIRECT (API v3) preferred talking_head provider + photo-avatar look cache.
-- Cost: Avatar III Photo Avatar = $0.0433/sec (self-serve API pricing).
-- Source: https://developers.heygen.com/docs/pricing (Avatar III / Photo Avatar table)
--          and https://www.heygen.com/api-pricing (API pricing entry).
-- Integer catalog unit: 4¢/s (≈ $2.40/min; docs list $0.0433/sec ≈ 4.33¢ — rounded down).
-- Gateway row ai_gateway_heygen_avatar stays active as fallback when HEYGEN_API_KEY
-- is missing or the direct adapter errors (resolver prefers heygen_high when both active).

UPDATE public.neuramark_provider_catalog
SET
  active = true,
  cost_model = '{
    "billingUnit": "per_second",
    "unitCostCents": 4,
    "metadata": {
      "plan": "api_payg_avatar_iii_photo",
      "vendor": "heygen",
      "engine": "avatar_iii",
      "resolution": "720p",
      "approxPerMinuteCents": 240,
      "docsUnitCostUsdPerSec": 0.0433,
      "pricingSource": "https://developers.heygen.com/docs/pricing"
    }
  }'::jsonb,
  capabilities = COALESCE(capabilities, '{}'::jsonb) || '{
    "transport": "heygen_direct_v3",
    "preferredTalkingHead": true,
    "resolution": "720p",
    "aspectRatio": "9:16"
  }'::jsonb
WHERE key = 'heygen_high';

-- Keep gateway HeyGen as active fallback (do not deactivate).
UPDATE public.neuramark_provider_catalog
SET
  capabilities = COALESCE(capabilities, '{}'::jsonb) || '{
    "transport": "ai_gateway",
    "fallbackTalkingHead": true
  }'::jsonb
WHERE key = 'ai_gateway_heygen_avatar';

-- Cache HeyGen photo-avatar look ids per client portrait asset (reuse across jobs).
CREATE TABLE public.neuramark_heygen_avatar_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  portrait_asset_id uuid NOT NULL
    REFERENCES public.neuramark_media_assets (id) ON DELETE CASCADE,
  heygen_look_id text NOT NULL
    CONSTRAINT neuramark_heygen_avatar_looks_look_id_check
      CHECK (char_length(heygen_look_id) >= 4 AND char_length(heygen_look_id) <= 128),
  heygen_group_id text NULL
    CONSTRAINT neuramark_heygen_avatar_looks_group_id_check
      CHECK (
        heygen_group_id IS NULL
        OR (char_length(heygen_group_id) >= 4 AND char_length(heygen_group_id) <= 128)
      ),
  heygen_image_asset_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_heygen_avatar_looks_client_portrait_unique
    UNIQUE (client_id, portrait_asset_id)
);

CREATE TRIGGER neuramark_heygen_avatar_looks_set_updated_at
  BEFORE UPDATE ON public.neuramark_heygen_avatar_looks
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

CREATE INDEX neuramark_heygen_avatar_looks_client_idx
  ON public.neuramark_heygen_avatar_looks (client_id);

ALTER TABLE public.neuramark_heygen_avatar_looks ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default; service-role Node only.

COMMENT ON TABLE public.neuramark_heygen_avatar_looks IS
  'Cached HeyGen v3 photo-avatar look ids keyed by client portrait media asset.';

-- Segment metadata for multi-clip avatar talking-head jobs (≤8s each).
ALTER TABLE public.neuramark_video_jobs
  ADD COLUMN IF NOT EXISTS segment_index integer
    CONSTRAINT neuramark_video_jobs_segment_index_check
      CHECK (segment_index IS NULL OR segment_index >= 0),
  ADD COLUMN IF NOT EXISTS segment_start_sec double precision
    CONSTRAINT neuramark_video_jobs_segment_start_sec_check
      CHECK (segment_start_sec IS NULL OR segment_start_sec >= 0),
  ADD COLUMN IF NOT EXISTS segment_duration_sec double precision
    CONSTRAINT neuramark_video_jobs_segment_duration_sec_check
      CHECK (segment_duration_sec IS NULL OR segment_duration_sec > 0);

COMMENT ON COLUMN public.neuramark_video_jobs.segment_index IS
  '0-based avatar voiceover segment index; null for non-segmented jobs.';
COMMENT ON COLUMN public.neuramark_video_jobs.segment_start_sec IS
  'Start offset of this segment within the full ElevenLabs voiceover (seconds).';
COMMENT ON COLUMN public.neuramark_video_jobs.segment_duration_sec IS
  'Duration of the segment audio / requested avatar clip (seconds).';
