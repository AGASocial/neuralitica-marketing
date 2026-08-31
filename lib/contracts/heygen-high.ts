/**
 * Frozen HeyGen / heygen_high contract constants (US-8.7 CONTRACT).
 * FE-safe — no secrets. Adapter reads env via HEYGEN_ENV_KEY_NAME at runtime.
 */
import { z } from "zod";

/** Error code when HEYGEN_API_KEY is missing before vendor I/O. */
export const PROVIDER_CONFIG_MISSING = "PROVIDER_CONFIG_MISSING" as const;

/** Catalog env_key_name for heygen_high (US-X.4 seed). */
export const HEYGEN_ENV_KEY_NAME = "HEYGEN_API_KEY" as const;

/**
 * Optional server-only studio / photo-avatar look id for generic_avatar path.
 * Loaded via process.env in the adapter factory — never client-writable.
 */
export const HEYGEN_DEFAULT_AVATAR_ID_ENV = "HEYGEN_DEFAULT_AVATAR_ID" as const;

/** HeyGen External API control plane — only host for create/get. */
export const HEYGEN_API_BASE_URL = "https://api.heygen.com" as const;

/** Create video (v3). */
export const HEYGEN_CREATE_VIDEO_PATH = "/v3/videos" as const;

/** Get video status (v3) — append `/{video_id}`. */
export const HEYGEN_GET_VIDEO_PATH_PREFIX = "/v3/videos/" as const;

/** Auth header name — value is HEYGEN_API_KEY only. */
export const HEYGEN_API_KEY_HEADER = "X-Api-Key" as const;

/**
 * Non–Avatar-IV engine for `type: "avatar"` creates.
 * HeyGen defaults to Avatar IV when `engine` is omitted on avatar requests —
 * omitting is a BUILD veto. Avatar V is out of scope.
 * @see https://developers.heygen.com/reference/create-video
 */
export const HEYGEN_AVATAR_ENGINE = {
  type: "avatar_iii",
} as const;

/** Forbidden engine types in V1 (cost / product footguns). */
export const HEYGEN_FORBIDDEN_ENGINE_TYPES = [
  "avatar_iv",
  "avatar_v",
] as const;

/**
 * HTTPS hosts allowed for provider output download (suffix match per
 * validateProviderOutputUrl). Distinct from Replicate hosts.
 * Extend only via CONTRACT revision + security review.
 */
export const HEYGEN_ALLOWED_OUTPUT_HOSTS: readonly string[] = [
  "files.heygen.com",
  "files.heygen.ai",
  "resource.heygen.com",
  "resource.heygen.ai",
];

/** fetchAsset download hardening — mirrors SadTalker/MuseTalk. */
export const HEYGEN_FETCH_TIMEOUT_MS = 120_000 as const;
export const HEYGEN_FETCH_MAX_BYTES = 104_857_600 as const;
export const HEYGEN_FETCH_MAX_REDIRECTS = 3 as const;

/** Short-lived provider-readable asset URL TTL at createJob (seconds). */
export const HEYGEN_INPUT_URL_TTL_SEC = 300 as const;

/** Catalog billing unit for heygen_high (no per_minute enum). */
export const HEYGEN_BILLING_UNIT = "per_second" as const;

/**
 * Standard plan unit cost (cents per second).
 * 2¢/s ≈ $1.20/min — aligns USER_STORIES ~$1/min AC via approxPerMinuteCents: 120.
 * Corrects prior US-X.4 seed of 7¢/s (~$4.20/min).
 */
export const HEYGEN_UNIT_COST_CENTS_PER_SECOND = 2 as const;

/** Approx per-minute cents for Operator estimate copy / metadata. */
export const HEYGEN_APPROX_PER_MINUTE_CENTS = 120 as const;

/** Frozen catalog cost_model JSON shape (Phase B migration target). */
export const HEYGEN_CATALOG_COST_MODEL = {
  billingUnit: HEYGEN_BILLING_UNIT,
  unitCostCents: HEYGEN_UNIT_COST_CENTS_PER_SECOND,
  metadata: {
    plan: "standard",
    vendor: "heygen",
    approxPerMinuteCents: HEYGEN_APPROX_PER_MINUTE_CENTS,
  },
} as const;

/** V1 create defaults for avatar / image requests. */
export const HEYGEN_DEFAULT_CREATE_OPTIONS = {
  resolution: "1080p",
  aspect_ratio: "9:16",
  output_format: "mp4",
} as const;

/** MIME types accepted for own_avatar portrait inputs resolved server-side. */
export const HEYGEN_PORTRAIT_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** MIME types accepted for voiceover audio inputs resolved server-side. */
export const HEYGEN_AUDIO_MIME_ALLOWLIST = [
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "video/mp4",
] as const;

export const heygenPortraitMimeSchema = z.enum(HEYGEN_PORTRAIT_MIME_ALLOWLIST);
export const heygenAudioMimeSchema = z.enum(HEYGEN_AUDIO_MIME_ALLOWLIST);

export const heygenAvatarEngineSchema = z
  .object({
    type: z.literal("avatar_iii"),
  })
  .strict();

export type HeygenAvatarEngine = z.infer<typeof heygenAvatarEngineSchema>;

/** HeyGen create request discriminant (adapter-internal). */
export const heygenCreateRequestTypeSchema = z.enum(["avatar", "image"]);

export type HeygenCreateRequestType = z.infer<
  typeof heygenCreateRequestTypeSchema
>;

/** Vendor status strings observed on GET /v3/videos/{id} → normalize to videoJobStatus. */
export const HEYGEN_VENDOR_STATUS_MAP = {
  waiting: "queued",
  pending: "queued",
  processing: "processing",
  completed: "completed",
  failed: "failed",
  error: "failed",
  cancelled: "cancelled",
  canceled: "cancelled",
} as const;

/** Override rationale key for operator fallback audit + provider_decisions. */
export const HEYGEN_FALLBACK_RATIONALE_KEY = "operator_heygen_fallback" as const;

/** High-tier policy rationale when heygen_high is selected. */
export const HEYGEN_HIGH_TIER_RATIONALE_KEY = "cheapest_active_high_tier" as const;

/** i18n key prefix for Operator FE (Phase B). */
export const HEYGEN_FE_I18N_PREFIX = "scripts.heygen." as const;
