-- US-9.1 Phase B: nullable primary for stitch-only + persisted broll clip set

ALTER TABLE public.neuramark_assembled_reels
  ALTER COLUMN primary_video_asset_id DROP NOT NULL;

ALTER TABLE public.neuramark_assembled_reels
  ADD COLUMN IF NOT EXISTS broll_asset_ids uuid[] NULL;

ALTER TABLE public.neuramark_assembled_reels
  ADD COLUMN IF NOT EXISTS assembly_path_tag text NOT NULL DEFAULT 'primary'
  CHECK (assembly_path_tag IN ('primary', 'broll_stitch'));

ALTER TABLE public.neuramark_assembled_reels
  DROP CONSTRAINT IF EXISTS neuramark_assembled_reels_path_inputs_chk;

ALTER TABLE public.neuramark_assembled_reels
  ADD CONSTRAINT neuramark_assembled_reels_path_inputs_chk
  CHECK (
    (
      assembly_path_tag = 'primary'
      AND primary_video_asset_id IS NOT NULL
      AND (broll_asset_ids IS NULL OR cardinality(broll_asset_ids) = 0)
    )
    OR
    (
      assembly_path_tag = 'broll_stitch'
      AND broll_asset_ids IS NOT NULL
      AND cardinality(broll_asset_ids) BETWEEN 1 AND 8
    )
  );

COMMENT ON COLUMN public.neuramark_assembled_reels.broll_asset_ids IS
  'US-9.1 Phase B: ordered owned broll media asset ids frozen at enqueue (created_at ASC, max 8). Worker replay source.';
COMMENT ON COLUMN public.neuramark_assembled_reels.assembly_path_tag IS
  'US-9.1 Phase B: server path — primary | broll_stitch. Mirrors fingerprint path_tag; not client-writable.';
