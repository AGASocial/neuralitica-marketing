/**
 * Frozen MuseTalk / Replicate contract constants (US-8.6 CONTRACT).
 * FE-safe — no secrets. Adapter reads env via MUSETALK_ENV_KEY_NAME at runtime.
 */
import { z } from "zod";

/** Error code when REPLICATE_API_TOKEN is missing before vendor I/O. */
export const PROVIDER_CONFIG_MISSING = "PROVIDER_CONFIG_MISSING" as const;

/** Catalog env_key_name for musetalk_low (US-X.4 seed). */
export const MUSETALK_ENV_KEY_NAME = "REPLICATE_API_TOKEN" as const;

/** Replicate Predictions API control plane — only host for create/get. */
export const REPLICATE_API_BASE_URL = "https://api.replicate.com" as const;

/**
 * Replicate model version hash for douwantech/musetalk (version 5501004e).
 * Upgrade via code change + security review — not catalog.
 */
export const MUSETALK_REPLICATE_MODEL_VERSION =
  "cf72088c48fe548434d8603194e74af287b84f60" as const;

/**
 * HTTPS hosts allowed for provider output download (suffix match per validateProviderOutputUrl).
 * Lean V1: same Replicate delivery CDN set as SadTalker (US-8.2 CONTRACT).
 */
export const MUSETALK_ALLOWED_OUTPUT_HOSTS: readonly string[] = [
  "replicate.delivery",
  "pbxt.replicate.delivery",
  "replicateusercontent.com",
];

/** fetchAsset download hardening — mirrors SadTalker (US-8.2 SECURITY). */
export const MUSETALK_FETCH_TIMEOUT_MS = 120_000 as const;
export const MUSETALK_FETCH_MAX_BYTES = 104_857_600 as const;
export const MUSETALK_FETCH_MAX_REDIRECTS = 3 as const;

/** Short-lived provider-readable asset URL TTL at createJob (seconds). */
export const MUSETALK_INPUT_URL_TTL_SEC = 300 as const;

/** MuseTalk createJob input field names on Replicate prediction body. */
export const MUSETALK_REPLICATE_INPUT_FIELDS = {
  video: "video",
  audio: "audio",
  bboxShift: "bbox_shift",
  cycle: "cycle",
} as const;

/** Frozen optional MuseTalk prediction inputs (V1 defaults). */
export const MUSETALK_DEFAULT_PREDICTION_INPUT = {
  bbox_shift: 0,
  cycle: true,
} as const;

/** MIME types accepted for reference-loop video inputs resolved server-side. */
export const MUSETALK_VIDEO_MIME_ALLOWLIST = [
  "video/mp4",
  "video/quicktime",
] as const;

/**
 * MIME types accepted for voiceover audio inputs resolved server-side.
 * Same set as SadTalker (US-8.2 CONTRACT).
 */
export const MUSETALK_AUDIO_MIME_ALLOWLIST = [
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "video/mp4",
] as const;

/** Asset resolver kind seam — shared by SadTalker + MuseTalk adapters (US-8.6 CONTRACT). */
export const providerMediaAssetKindSchema = z.enum([
  "video",
  "audio",
  "portrait",
]);

export type ProviderMediaAssetKind = z.infer<typeof providerMediaAssetKindSchema>;

export const musetalkVideoMimeSchema = z.enum(MUSETALK_VIDEO_MIME_ALLOWLIST);
export const musetalkAudioMimeSchema = z.enum(MUSETALK_AUDIO_MIME_ALLOWLIST);

/** neuramark_media_assets.asset_type for reference-loop rows (US-3.3). */
export const MUSETALK_REFERENCE_LOOP_ASSET_TYPE = "avatar_reference" as const;
