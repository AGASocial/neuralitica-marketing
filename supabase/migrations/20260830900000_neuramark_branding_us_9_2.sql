-- US-9.2: branding columns, client logo, cover frame asset types

ALTER TYPE public.neuramark_media_asset_type ADD VALUE IF NOT EXISTS 'client_logo';
ALTER TYPE public.neuramark_media_asset_type ADD VALUE IF NOT EXISTS 'cover_frame';

-- Ficha viva: client logo FK + default assembly/branding toggles
ALTER TABLE public.neuramark_business_profiles
  ADD COLUMN IF NOT EXISTS logo_asset_id uuid
    REFERENCES public.neuramark_media_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assembly_config jsonb DEFAULT NULL;

CREATE INDEX IF NOT EXISTS neuramark_business_profiles_logo_asset_id_idx
  ON public.neuramark_business_profiles (logo_asset_id)
  WHERE logo_asset_id IS NOT NULL;

COMMENT ON COLUMN public.neuramark_business_profiles.logo_asset_id IS
  'US-9.2: single active client_logo media asset FK; set only via uploadClientLogo Server Action.';
COMMENT ON COLUMN public.neuramark_business_profiles.assembly_config IS
  'US-9.2: Cliente default branding toggles JSON — subtitlesEnabled, logoEnabled, coverFrameSec.';

-- Assembly row: branding second-pass state + lineage
ALTER TABLE public.neuramark_assembled_reels
  ADD COLUMN IF NOT EXISTS branding_status text
    CHECK (branding_status IS NULL OR branding_status IN (
      'queued', 'processing', 'completed', 'failed', 'skipped'
    )),
  ADD COLUMN IF NOT EXISTS branding_config jsonb,
  ADD COLUMN IF NOT EXISTS branding_fingerprint text
    CHECK (branding_fingerprint IS NULL OR char_length(branding_fingerprint) = 64),
  ADD COLUMN IF NOT EXISTS pre_branding_output_media_asset_id uuid
    REFERENCES public.neuramark_media_assets(id),
  ADD COLUMN IF NOT EXISTS cover_media_asset_id uuid
    REFERENCES public.neuramark_media_assets(id);

CREATE INDEX IF NOT EXISTS neuramark_assembled_reels_branding_status_updated_idx
  ON public.neuramark_assembled_reels (branding_status, updated_at)
  WHERE branding_status IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS neuramark_assembled_reels_branding_idempotency_completed_uq
  ON public.neuramark_assembled_reels (client_id, id, branding_fingerprint)
  WHERE branding_status = 'completed' AND branding_fingerprint IS NOT NULL;

COMMENT ON COLUMN public.neuramark_assembled_reels.pre_branding_output_media_asset_id IS
  'US-9.2: US-9.1 assembled_reel output before branding swap; set at branding start.';
COMMENT ON COLUMN public.neuramark_assembled_reels.cover_media_asset_id IS
  'US-9.2: cover_frame JPEG extracted from branded output for manual IG upload.';

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
      OR
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/branded-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'
      OR
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      OR
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
    )
  );
