/**
 * Frozen SadTalker / Replicate contract constants (US-8.2 CONTRACT).
 * FE-safe — no secrets. Adapter reads env via SADTALKER_ENV_KEY_NAME at runtime.
 */
import { z } from "zod";

/** Error code when REPLICATE_API_TOKEN is missing before vendor I/O. */
export const PROVIDER_CONFIG_MISSING = "PROVIDER_CONFIG_MISSING" as const;

/** Catalog env_key_name for sadtalker_low (US-X.4 seed). */
export const SADTALKER_ENV_KEY_NAME = "REPLICATE_API_TOKEN" as const;

/** Replicate Predictions API control plane — only host for create/get. */
export const REPLICATE_API_BASE_URL = "https://api.replicate.com" as const;

/**
 * Replicate model version hash for cjwbw/sadtalker.
 * Upgrade via code change + security review — not catalog.
 */
export const SADTALKER_REPLICATE_MODEL_VERSION =
  "3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376" as const;

/**
 * HTTPS hosts allowed for provider output download (suffix match per validateProviderOutputUrl).
 * Extend only via CONTRACT revision + catalog migration mirror.
 */
export const SADTALKER_ALLOWED_OUTPUT_HOSTS: readonly string[] = [
  "replicate.delivery",
  "pbxt.replicate.delivery",
  "replicateusercontent.com",
];

/** fetchAsset download hardening (US-8.2 SECURITY). */
export const SADTALKER_FETCH_TIMEOUT_MS = 120_000 as const;
export const SADTALKER_FETCH_MAX_BYTES = 104_857_600 as const;
export const SADTALKER_FETCH_MAX_REDIRECTS = 3 as const;

/** Short-lived provider-readable asset URL TTL at createJob (seconds). */
export const SADTALKER_INPUT_URL_TTL_SEC = 300 as const;

/** SadTalker createJob input field names on Replicate prediction body. */
export const SADTALKER_REPLICATE_INPUT_FIELDS = {
  sourceImage: "source_image",
  drivenAudio: "driven_audio",
  preprocess: "preprocess",
  still: "still",
  enhancer: "enhancer",
} as const;

/** Frozen optional SadTalker prediction inputs (V1 defaults). */
export const SADTALKER_DEFAULT_PREDICTION_INPUT = {
  preprocess: "full",
  still: true,
  enhancer: "gfpgan",
} as const;

/** MIME types accepted for portrait still inputs resolved server-side. */
export const SADTALKER_PORTRAIT_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** MIME types accepted for voiceover audio inputs resolved server-side. */
export const SADTALKER_AUDIO_MIME_ALLOWLIST = [
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "video/mp4",
] as const;

export const sadtalkerPortraitMimeSchema = z.enum(SADTALKER_PORTRAIT_MIME_ALLOWLIST);
export const sadtalkerAudioMimeSchema = z.enum(SADTALKER_AUDIO_MIME_ALLOWLIST);
