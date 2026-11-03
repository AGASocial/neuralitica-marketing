/**
 * ElevenLabs TTS high-tier contract constants (US-9.3 Phase B).
 * FE-safe — no secrets.
 */

export const ELEVENLABS_TTS_PROVIDER_KEY = "elevenlabs_tts_high" as const;
export const ELEVENLABS_ENV_KEY_NAME = "ELEVENLABS_API_KEY" as const;

/**
 * Flash v2.5 supports `language_code` (ISO 639-1). multilingual_v2 does not.
 * @see https://elevenlabs.io/docs/overview/models
 */
export const ELEVENLABS_MODEL_ID = "eleven_flash_v2_5" as const;

/** Models that accept language_code (avatar language → en|es). */
export const ELEVENLABS_LANGUAGE_CODE_MODELS = [
  "eleven_flash_v2_5",
  "eleven_turbo_v2_5",
  "eleven_flash_v2",
  "eleven_turbo_v2",
] as const;

export const ELEVENLABS_TTS_URL_PREFIX =
  "https://api.elevenlabs.io/v1/text-to-speech" as const;

export const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128" as const;

/** Catalog seed cost: $3.00 / 1M chars. */
export const ELEVENLABS_UNIT_COST_CENTS_PER_1M_CHARS = 300 as const;
