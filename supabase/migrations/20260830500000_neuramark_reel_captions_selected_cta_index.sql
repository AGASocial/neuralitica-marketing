-- US-6.2: Operator-selected CTA variant index (0-based into cta_variants jsonb).

ALTER TABLE public.neuramark_reel_captions
  ADD COLUMN selected_cta_index integer NULL;

ALTER TABLE public.neuramark_reel_captions
  ADD CONSTRAINT neuramark_reel_captions_selected_cta_index_nonneg_check
  CHECK (selected_cta_index IS NULL OR selected_cta_index >= 0);

COMMENT ON COLUMN public.neuramark_reel_captions.selected_cta_index IS
  '0-based index into cta_variants jsonb; NULL until Operator selects via selectReelCaptionCta (US-6.2). Upper bound enforced in app layer against jsonb array length.';
