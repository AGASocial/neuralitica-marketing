-- US-9.3 Phase B: Activate ElevenLabs high-tier TTS (eleven_multilingual_v2).
-- Cost model already seeded at $3.00 / 1M chars (300¢). Quality > cost for Spanish voiceover.

UPDATE public.neuramark_provider_catalog
SET
  active = true,
  cost_model = '{
    "billingUnit": "per_1m_chars",
    "unitCostCents": 300,
    "metadata": {
      "plan": "multilingual",
      "vendor": "elevenlabs",
      "model": "eleven_multilingual_v2"
    }
  }'::jsonb
WHERE key = 'elevenlabs_tts_high';
