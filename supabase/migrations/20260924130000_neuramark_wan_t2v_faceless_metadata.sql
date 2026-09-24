-- Faceless B-roll: Wan catalog metadata reflects T2V (prompt-only) model.
-- Catalog key remains siliconflow_wan21_turbo; billing unit/cost unchanged.

UPDATE public.neuramark_provider_catalog
SET
  cost_model = jsonb_set(
    jsonb_set(
      cost_model,
      '{metadata,model}',
      '"wan2.2-t2v-a14b"'::jsonb,
      true
    ),
    '{metadata,siliconflowModelId}',
    '"Wan-AI/Wan2.2-T2V-A14B"'::jsonb,
    true
  ),
  updated_at = now()
WHERE key = 'siliconflow_wan21_turbo';
