-- Allow the avatar_segments assembly path (1–2 HeyGen segments + optional
-- b-roll cutaways) introduced with HeyGen direct v3 (#20).
ALTER TABLE public.neuramark_assembled_reels
  DROP CONSTRAINT IF EXISTS neuramark_assembled_reels_assembly_path_tag_check;
ALTER TABLE public.neuramark_assembled_reels
  ADD CONSTRAINT neuramark_assembled_reels_assembly_path_tag_check
    CHECK (assembly_path_tag = ANY (ARRAY['primary'::text, 'broll_stitch'::text, 'avatar_segments'::text]));

ALTER TABLE public.neuramark_assembled_reels
  DROP CONSTRAINT IF EXISTS neuramark_assembled_reels_path_inputs_chk;
ALTER TABLE public.neuramark_assembled_reels
  ADD CONSTRAINT neuramark_assembled_reels_path_inputs_chk
    CHECK (
      (assembly_path_tag = 'primary' AND primary_video_asset_id IS NOT NULL
        AND (broll_asset_ids IS NULL OR cardinality(broll_asset_ids) = 0))
      OR (assembly_path_tag = 'broll_stitch' AND broll_asset_ids IS NOT NULL
        AND cardinality(broll_asset_ids) BETWEEN 1 AND 8)
      OR (assembly_path_tag = 'avatar_segments' AND primary_video_asset_id IS NOT NULL
        AND (broll_asset_ids IS NULL OR cardinality(broll_asset_ids) <= 8))
    );
