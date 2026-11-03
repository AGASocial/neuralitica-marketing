-- Vercel AI Gateway video adapters as defaults:
--   * ai_gateway_heygen_avatar — high-tier talking presenter (HeyGen Video 1 @ 480p)
--   * ai_gateway_seedance_broll — low-tier B-roll (Seedance Pro Fast @ 480p + fallbacks)
-- Deactivates direct HeyGen (heygen_high) and FAL LTX (ltx_broll_high) as preferred paths.
-- Legacy rows remain in catalog for optional reactivation. Do not drop them.

INSERT INTO public.neuramark_provider_catalog (
  key, asset_role, tier, active, capabilities, cost_model, env_key_name
) VALUES (
  'ai_gateway_heygen_avatar',
  'talking_head',
  'high',
  true,
  '{"transport": "ai_gateway", "resolution": "480p"}'::jsonb,
  '{
    "billingUnit": "per_second",
    "unitCostCents": 1,
    "metadata": {
      "gatewayModel": "heygen/heygen-video-1",
      "resolution": "480p",
      "vendor": "vercel_ai_gateway",
      "approxPerMinuteCents": 60
    }
  }'::jsonb,
  'AI_GATEWAY_API_KEY'
)
ON CONFLICT (key) DO UPDATE SET
  asset_role = EXCLUDED.asset_role,
  tier = EXCLUDED.tier,
  active = EXCLUDED.active,
  capabilities = EXCLUDED.capabilities,
  cost_model = EXCLUDED.cost_model,
  env_key_name = EXCLUDED.env_key_name;

INSERT INTO public.neuramark_provider_catalog (
  key, asset_role, tier, active, capabilities, cost_model, env_key_name
) VALUES (
  'ai_gateway_seedance_broll',
  'broll',
  'low',
  true,
  '{"transport": "ai_gateway", "resolution": "480p"}'::jsonb,
  '{
    "billingUnit": "per_clip",
    "unitCostCents": 5,
    "metadata": {
      "gatewayModel": "bytedance/seedance-v1.0-pro-fast",
      "gatewayFallbackModels": [
        "spacexai/grok-imagine-video-1.5-lite",
        "google/veo-3.1-lite-generate-001"
      ],
      "resolution": "480p",
      "clipDurationSec": 5,
      "vendor": "vercel_ai_gateway"
    }
  }'::jsonb,
  'AI_GATEWAY_API_KEY'
)
ON CONFLICT (key) DO UPDATE SET
  asset_role = EXCLUDED.asset_role,
  tier = EXCLUDED.tier,
  active = EXCLUDED.active,
  capabilities = EXCLUDED.capabilities,
  cost_model = EXCLUDED.cost_model,
  env_key_name = EXCLUDED.env_key_name;

-- Prefer Gateway paths: deactivate direct HeyGen + FAL LTX defaults.
UPDATE public.neuramark_provider_catalog
SET active = false
WHERE key IN ('heygen_high', 'ltx_broll_high');
