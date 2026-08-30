-- US-9.1: assembly jobs + assembled_reel media type

ALTER TYPE public.neuramark_media_asset_type ADD VALUE IF NOT EXISTS 'assembled_reel';

CREATE TABLE public.neuramark_assembled_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  reel_script_id uuid NOT NULL REFERENCES public.neuramark_reel_scripts(id) ON DELETE CASCADE,
  template_id text NOT NULL CHECK (template_id IN ('reel_v1_basic')),
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  primary_video_asset_id uuid NOT NULL REFERENCES public.neuramark_media_assets(id),
  voiceover_asset_id uuid REFERENCES public.neuramark_media_assets(id),
  output_media_asset_id uuid REFERENCES public.neuramark_media_assets(id),
  script_updated_at timestamptz NOT NULL,
  input_fingerprint text NOT NULL CHECK (char_length(input_fingerprint) = 64),
  target_duration_sec numeric(8, 2) NOT NULL CHECK (target_duration_sec > 0),
  actual_duration_sec numeric(8, 2) CHECK (actual_duration_sec IS NULL OR actual_duration_sec > 0),
  failure_reason text CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_assembled_reels_client_reel_idx
  ON public.neuramark_assembled_reels (client_id, reel_script_id);

CREATE INDEX neuramark_assembled_reels_status_updated_idx
  ON public.neuramark_assembled_reels (status, updated_at);

CREATE UNIQUE INDEX neuramark_assembled_reels_idempotency_completed_uq
  ON public.neuramark_assembled_reels (client_id, reel_script_id, script_updated_at, input_fingerprint)
  WHERE status = 'completed';

CREATE TRIGGER neuramark_assembled_reels_set_updated_at
  BEFORE UPDATE ON public.neuramark_assembled_reels
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_assembled_reels ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_assembled_reels IS
  'FFmpeg assembly jobs (US-9.1). Output via output_media_asset_id — no preview_url/final_url columns.';

ALTER TABLE public.neuramark_media_assets
  DROP CONSTRAINT IF EXISTS neuramark_media_assets_storage_key_relative_chk;

ALTER TABLE public.neuramark_media_assets
  ADD CONSTRAINT neuramark_media_assets_storage_key_relative_chk
  CHECK (
    storage_key !~ '^/' AND
    storage_key !~ '\\' AND
    storage_key !~ '\.\.' AND
    (
      storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|mov)$'
      OR
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp3|wav|m4a)$'
      OR
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/assembled-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'
    )
  );
