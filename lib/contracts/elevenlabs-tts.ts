/**
 * ElevenLabs TTS high-tier contract constants (US-9.3 Phase B).
 * FE-safe — no secrets.
 */

export const ELEVENLABS_TTS_PROVIDER_KEY = "elevenlabs_tts_high" as const;
export const ELEVENLABS_ENV_KEY_NAME = "ELEVENLABS_API_KEY" as const;

/** Multilingual model — auto-detects Spanish/English from script text. */
export const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2" as const;

export const ELEVENLABS_TTS_URL_PREFIX =
  "https://api.elevenlabs.io/v1/text-to-speech" as const;

export const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128" as const;

/** Catalog seed cost: $3.00 / 1M chars. */
export const ELEVENLABS_UNIT_COST_CENTS_PER_1M_CHARS = 300 as const;
