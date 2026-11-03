-- Vercel AI Gateway LLM (Gemini 2.5 Flash Lite) as preferred low-tier LLM for
-- strategy / script / caption / QA agents. SiliconFlow rows stay as options.
-- Pricing (gateway list, 2026-11-03): $0.10 / 1M input, $0.40 / 1M output.
-- unitCostCents is a blended per-1M-token estimate (~70% input / 30% output → ~$0.19, rounded up).
INSERT INTO public.neuramark_provider_catalog (
  key, asset_role, tier, active, capabilities, cost_model, env_key_name
) VALUES (
  'ai_gateway_gemini_flash_lite',
  'llm',
  'low',
  true,
  '{"structuredOutput": true, "transport": "ai_gateway"}'::jsonb,
  '{"billingUnit": "per_1m_tokens", "unitCostCents": 20, "metadata": {"gatewayModel": "google/gemini-2.5-flash-lite", "inputUsdPer1m": 0.10, "outputUsdPer1m": 0.40, "vendor": "vercel_ai_gateway"}}'::jsonb,
  'AI_GATEWAY_API_KEY'
)
ON CONFLICT (key) DO UPDATE SET
  asset_role = EXCLUDED.asset_role,
  tier = EXCLUDED.tier,
  active = EXCLUDED.active,
  capabilities = EXCLUDED.capabilities,
  cost_model = EXCLUDED.cost_model,
  env_key_name = EXCLUDED.env_key_name;
