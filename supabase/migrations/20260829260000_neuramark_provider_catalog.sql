-- US-X.4: Global provider catalog (neuramark_provider_catalog)
-- RLS deny-by-default; service-role Node only. No client_id — global in V1.

CREATE TABLE public.neuramark_provider_catalog (
  key           text PRIMARY KEY,
  asset_role    text NOT NULL,
  tier          text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  capabilities  jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_model    jsonb NOT NULL,
  env_key_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_provider_catalog_asset_role_chk
    CHECK (asset_role IN ('llm', 'tts', 'talking_head', 'broll')),
  CONSTRAINT neuramark_provider_catalog_tier_chk
    CHECK (tier IN ('low', 'high')),
  CONSTRAINT neuramark_provider_catalog_env_key_name_chk
    CHECK (env_key_name ~ '^[A-Z][A-Z0-9_]+$' AND env_key_name NOT LIKE 'NEXT_PUBLIC_%'),
  CONSTRAINT neuramark_provider_catalog_cost_model_object_chk
    CHECK (jsonb_typeof(cost_model) = 'object')
);

CREATE INDEX neuramark_provider_catalog_role_tier_active_idx
  ON public.neuramark_provider_catalog (asset_role, tier, active);

CREATE TRIGGER neuramark_provider_catalog_set_updated_at
  BEFORE UPDATE ON public.neuramark_provider_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_provider_catalog ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.

COMMENT ON TABLE public.neuramark_provider_catalog IS
  'Global provider catalog for server-side vendor resolution (US-X.4). Migration seed + SQL only in V1.';

-- Low-tier active rows (estimate placeholders for US-7.2 — not live vendor quotes).
INSERT INTO public.neuramark_provider_catalog (
  key, asset_role, tier, active, capabilities, cost_model, env_key_name
) VALUES
  (
    'siliconflow_deepseek_flash',
    'llm',
    'low',
    true,
    '{}'::jsonb,
    '{"billingUnit": "per_1m_tokens", "unitCostCents": 14, "metadata": {"model": "deepseek-v4-flash"}}'::jsonb,
    'SILICONFLOW_API_KEY'
  ),
  (
    'siliconflow_qwen',
    'llm',
    'low',
    true,
    '{}'::jsonb,
    '{"billingUnit": "per_1m_tokens", "unitCostCents": 18, "metadata": {"model": "qwen3.5-9b"}}'::jsonb,
    'SILICONFLOW_API_KEY'
  ),
  (
    'siliconflow_cosyvoice2',
    'tts',
    'low',
    true,
    '{}'::jsonb,
    '{"billingUnit": "per_1m_chars", "unitCostCents": 1, "metadata": {"model": "cosyvoice2"}}'::jsonb,
    'SILICONFLOW_API_KEY'
  ),
  (
    'sadtalker_low',
    'talking_head',
    'low',
    true,
    '{}'::jsonb,
    '{"billingUnit": "per_run", "unitCostCents": 10, "metadata": {"vendor": "replicate"}}'::jsonb,
    'REPLICATE_API_TOKEN'
  ),
  (
    'musetalk_low',
    'talking_head',
    'low',
    true,
    '{"prefersReferenceLoop": true}'::jsonb,
    '{"billingUnit": "per_run", "unitCostCents": 19, "metadata": {"vendor": "replicate"}}'::jsonb,
    'REPLICATE_API_TOKEN'
  ),
  (
    'siliconflow_wan21_turbo',
    'broll',
    'low',
    true,
    '{}'::jsonb,
    '{"billingUnit": "per_clip", "unitCostCents": 21, "metadata": {"clipDurationSec": 5, "model": "wan2.1-i2v-turbo"}}'::jsonb,
    'SILICONFLOW_API_KEY'
  ),
  (
    'manual',
    'talking_head',
    'low',
    true,
    '{"manualFallback": true}'::jsonb,
    '{"billingUnit": "per_run", "unitCostCents": 0}'::jsonb,
    'NEURAMARK_MANUAL_FALLBACK'
  );

-- High-tier inactive placeholders (P1 — active = false until SQL activation).
INSERT INTO public.neuramark_provider_catalog (
  key, asset_role, tier, active, capabilities, cost_model, env_key_name
) VALUES
  (
    'heygen_high',
    'talking_head',
    'high',
    false,
    '{}'::jsonb,
    '{"billingUnit": "per_second", "unitCostCents": 7, "metadata": {"plan": "standard"}}'::jsonb,
    'HEYGEN_API_KEY'
  ),
  (
    'ltx_broll_high',
    'broll',
    'high',
    false,
    '{}'::jsonb,
    '{"billingUnit": "per_clip", "unitCostCents": 126, "metadata": {"clipDurationSec": 5, "model": "ltx-2.3-pro"}}'::jsonb,
    'FAL_API_KEY'
  ),
  (
    'elevenlabs_tts_high',
    'tts',
    'high',
    false,
    '{}'::jsonb,
    '{"billingUnit": "per_1m_chars", "unitCostCents": 300, "metadata": {"plan": "multilingual"}}'::jsonb,
    'ELEVENLABS_API_KEY'
  );
