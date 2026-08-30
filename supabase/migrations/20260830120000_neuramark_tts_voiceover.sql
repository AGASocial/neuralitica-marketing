-- US-9.3: voiceover media assets + Preferencias voice_id

ALTER TYPE public.neuramark_media_asset_type ADD VALUE IF NOT EXISTS 'voiceover';

-- Replace storage_key CHECK to allow legacy UUID keys AND voiceover path keys
ALTER TABLE public.neuramark_media_assets
  DROP CONSTRAINT IF EXISTS neuramark_media_assets_storage_key_relative_chk;

ALTER TABLE public.neuramark_media_assets
  ADD CONSTRAINT neuramark_media_assets_storage_key_relative_chk
  CHECK (
    storage_key !~ '^/' AND
    storage_key !~ '\\' AND
    storage_key !~ '\.\.' AND
    (
      -- US-3.3 / US-8.3 legacy: single UUID + ext at repo root
      storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|mov)$'
      OR
      -- US-9.3 voiceover: neuramark/{clientId}/{reelScriptId}/{uuid}.mp3|wav|m4a
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp3|wav|m4a)$'
    )
  );

ALTER TABLE public.neuramark_visual_preferences
  ADD COLUMN IF NOT EXISTS voice_id text NULL;

COMMENT ON COLUMN public.neuramark_visual_preferences.voice_id IS
  'Optional catalog voice id (e.g. en_warm_female). App-validated against lib/tts/voice-catalog.ts — no DB FK to vendor.';
