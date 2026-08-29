-- US-3.3: Avatar reference media (referencias de avatar propio)
-- Product copy uses CONTEXT labels; technical columns only below.

CREATE TYPE public.neuramark_media_asset_type AS ENUM (
  'avatar_reference'
  -- future: 'work_photo', 'logo', 'voiceover', ... in sibling stories
);

CREATE TABLE public.neuramark_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  asset_type public.neuramark_media_asset_type NOT NULL,
  storage_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_media_assets_storage_key_nonempty_chk
    CHECK (char_length(trim(storage_key)) > 0),
  CONSTRAINT neuramark_media_assets_storage_key_relative_chk
    CHECK (
      storage_key !~ '^/' AND
      storage_key !~ '\\' AND
      storage_key !~ '\.\.' AND
      storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|mov)$'
    )
);

CREATE INDEX neuramark_media_assets_client_id_asset_type_idx
  ON public.neuramark_media_assets (client_id, asset_type);

CREATE INDEX neuramark_media_assets_client_id_created_at_idx
  ON public.neuramark_media_assets (client_id, created_at);

ALTER TABLE public.neuramark_media_assets ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
-- Access only via service-role Node (Next.js backend).

COMMENT ON TABLE public.neuramark_media_assets IS
  'Cliente-owned media assets; US-3.3 ships avatar_reference only. storage_key is relative opaque key — never absolute path.';
COMMENT ON COLUMN public.neuramark_media_assets.storage_key IS
  'Server-generated relative key (UUID + safe ext). Story/AC name path. Never client-supplied.';
COMMENT ON COLUMN public.neuramark_media_assets.metadata IS
  'Server-written jsonb: originalFilename, detectedMime, sizeBytes, optional width/height/durationSec.';
