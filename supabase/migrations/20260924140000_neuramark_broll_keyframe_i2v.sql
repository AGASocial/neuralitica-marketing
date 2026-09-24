-- Faceless B-roll keyframes: owned T2I stills before I2V (not logo/avatar).
ALTER TYPE public.neuramark_media_asset_type
  ADD VALUE IF NOT EXISTS 'broll_keyframe';

-- Wan catalog metadata: back to I2V (keyframes → video), not prompt-only T2V.
UPDATE public.neuramark_provider_catalog
SET
  cost_model = jsonb_set(
    jsonb_set(
      cost_model,
      '{metadata,model}',
      '"wan2.2-i2v-a14b"'::jsonb,
      true
    ),
    '{metadata,siliconflowModelId}',
    '"Wan-AI/Wan2.2-I2V-A14B"'::jsonb,
    true
  ),
  updated_at = now()
WHERE key = 'siliconflow_wan21_turbo';
