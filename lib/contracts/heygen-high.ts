/**
 * Frozen HeyGen DIRECT / heygen_high contract constants (API v3).
 * FE-safe — no secrets. Adapter reads env via HEYGEN_ENV_KEY_NAME at runtime.
 *
 * @see https://developers.heygen.com/endpoint-version-comparison.md
 * @see https://developers.heygen.com/audio-to-video.md
 * @see https://developers.heygen.com/docs/avatar-from-photo.md
 * @see https://developers.heygen.com/reference/upload-asset
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

/** Upload asset (v3) — multipart/form-data. */
export const HEYGEN_UPLOAD_ASSET_PATH = "/v3/assets" as const;

/** Create photo / prompt / twin avatar (v3). */
export const HEYGEN_CREATE_AVATAR_PATH = "/v3/avatars" as const;

/** Poll avatar look status — append `/{look_id}`. */
export const HEYGEN_GET_AVATAR_LOOK_PATH_PREFIX = "/v3/avatars/looks/" as const;

/** Create video (v3). */
export const HEYGEN_CREATE_VIDEO_PATH = "/v3/videos" as const;

/** Get video status (v3) — append `/{video_id}`. */
export const HEYGEN_GET_VIDEO_PATH_PREFIX = "/v3/videos/" as const;

/** Auth header name — value is HEYGEN_API_KEY only. */
export const HEYGEN_API_KEY_HEADER = "X-Api-Key" as const;

/**
 * Photo-avatar engine for `type: "avatar"` creates.
 * Avatar III is the dedicated photo-to-video pipeline (cheapest photo rate).
 * HeyGen defaults to Avatar IV when `engine` is omitted — omitting is a BUILD veto.
 * Avatar V is out of scope.
 * @see https://developers.heygen.com/models.md
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

/** Photo-avatar look poll — avoid hanging the createJob path. */
export const HEYGEN_LOOK_POLL_INTERVAL_MS = 2_000 as const;
export const HEYGEN_LOOK_POLL_MAX_ATTEMPTS = 60 as const;

/** Short-lived provider-readable asset URL TTL at createJob (seconds). */
export const HEYGEN_INPUT_URL_TTL_SEC = 300 as const;

/** Catalog billing unit for heygen_high (no per_minute enum). */
export const HEYGEN_BILLING_UNIT = "per_second" as const;

/**
 * Avatar III Photo Avatar self-serve API rate: $0.0433/sec → 4¢/s catalog unit
 * (integer cents; docs list 4.33¢ — rounded down for estimates).
 * @see https://developers.heygen.com/docs/pricing
 */
export const HEYGEN_UNIT_COST_CENTS_PER_SECOND = 4 as const;

/** Approx per-minute cents for Operator estimate copy / metadata. */
export const HEYGEN_APPROX_PER_MINUTE_CENTS = 240 as const;

/** Published docs unit (USD/sec) — stored in catalog metadata for audit. */
export const HEYGEN_DOCS_UNIT_COST_USD_PER_SEC = 0.0433 as const;

/** Frozen catalog cost_model JSON shape (v3 DIRECT migration target). */
export const HEYGEN_CATALOG_COST_MODEL = {
  billingUnit: HEYGEN_BILLING_UNIT,
  unitCostCents: HEYGEN_UNIT_COST_CENTS_PER_SECOND,
  metadata: {
    plan: "api_payg_avatar_iii_photo",
    vendor: "heygen",
    engine: "avatar_iii",
    resolution: "720p",
    approxPerMinuteCents: HEYGEN_APPROX_PER_MINUTE_CENTS,
    docsUnitCostUsdPerSec: HEYGEN_DOCS_UNIT_COST_USD_PER_SEC,
    pricingSource: "https://developers.heygen.com/docs/pricing",
  },
} as const;

/**
 * v3 create defaults — 9:16 full-frame 720p with cover fit (no letterbox).
 * @see https://developers.heygen.com/audio-to-video.md (fit / aspect_ratio / resolution)
 */
export const HEYGEN_DEFAULT_CREATE_OPTIONS = {
  resolution: "720p",
  aspect_ratio: "9:16",
  fit: "cover",
  output_format: "mp4",
} as const;

/** Portrait preprocess target before upload (9:16 @ 720p). */
export const HEYGEN_PORTRAIT_CROP_WIDTH = 720 as const;
export const HEYGEN_PORTRAIT_CROP_HEIGHT = 1280 as const;

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

/** DB table for cached photo-avatar looks. */
export const HEYGEN_AVATAR_LOOKS_TABLE = "neuramark_heygen_avatar_looks" as const;
