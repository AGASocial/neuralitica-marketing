/**
 * Frozen SiliconFlow Wan2.1 I2V Turbo / siliconflow_wan21_turbo contract
 * constants (US-8.5 CONTRACT). FE-safe — no secrets. Adapter reads env via
 * WAN_ENV_KEY_NAME at runtime.
 */
import { z } from "zod";

/** Error code when SILICONFLOW_API_KEY is missing before vendor I/O. */
export const PROVIDER_CONFIG_MISSING = "PROVIDER_CONFIG_MISSING" as const;

/** Catalog env_key_name for siliconflow_wan21_turbo (US-X.4 seed; shared LLM/TTS). */
export const WAN_ENV_KEY_NAME = "SILICONFLOW_API_KEY" as const;

/**
 * Catalog provider key — do not invent `wan_broll_low`.
 * Matches DEFAULT_LOW_TIER_PROVIDER_KEYS.broll.
 */
export const WAN_PROVIDER_KEY = "siliconflow_wan21_turbo" as const;

/** Adapter videoAssetRole — Wan jobs are never `primary`. */
export const WAN_VIDEO_ASSET_ROLE = "broll" as const;

/**
 * SiliconFlow control-plane host family — same as CosyVoice2 TTS.
 * Adapter must not accept caller-supplied base URL.
 */
export const WAN_API_BASE_URL = "https://api.siliconflow.cn" as const;

/** Submit async I2V job. */
export const WAN_SUBMIT_PATH = "/v1/video/submit" as const;

/** Poll job status (POST body with requestId — not GET). */
export const WAN_STATUS_PATH = "/v1/video/status" as const;

export const WAN_SUBMIT_URL = `${WAN_API_BASE_URL}${WAN_SUBMIT_PATH}` as const;
export const WAN_STATUS_URL = `${WAN_API_BASE_URL}${WAN_STATUS_PATH}` as const;

/**
 * Full SiliconFlow model id for Wan2.1 I2V Turbo (catalog metadata shorthand
 * `wan2.1-i2v-turbo`). ~$0.21/clip on SiliconFlow.
 */
export const WAN_MODEL_ID = "Wan-AI/Wan2.1-I2V-14B-720P-Turbo" as const;

/** Catalog cost_model.metadata.model lean alias (bootstrap parity). */
export const WAN_MODEL_METADATA_ALIAS = "wan2.1-i2v-turbo" as const;

/** Vertical Reel frame — 9:16. */
export const WAN_DEFAULT_IMAGE_SIZE = "720x1280" as const;

export const WAN_IMAGE_SIZE_ALLOWLIST = [
  "1280x720",
  "720x1280",
  "960x960",
] as const;

export const wanImageSizeSchema = z.enum(WAN_IMAGE_SIZE_ALLOWLIST);

/**
 * Policy band 3–5s; Wan hard cap 5s (catalog clipDurationSec).
 * Adapter/orchestrator **clamp** values above max (do not reject).
 */
export const WAN_CLIP_DURATION_MIN_SEC = 3 as const;
export const WAN_CLIP_DURATION_MAX_SEC = 5 as const;
export const WAN_CLIP_DURATION_DEFAULT_SEC = 5 as const;

/** Catalog billingUnit. */
export const WAN_BILLING_UNIT = "per_clip" as const;

/** Seed unitCostCents — AC ~$0.21/clip. Fix stub/registry 10¢ drift. */
export const WAN_UNIT_COST_CENTS_PER_CLIP = 21 as const;

/** Max B-roll clips per Reel (aligns reel-script `brollBeats` max 8). */
export const WAN_MAX_CLIPS_PER_REEL = 8 as const;

/** Frozen catalog cost_model JSON shape (bootstrap parity — no activate migration). */
export const WAN_CATALOG_COST_MODEL = {
  billingUnit: WAN_BILLING_UNIT,
  unitCostCents: WAN_UNIT_COST_CENTS_PER_CLIP,
  metadata: {
    clipDurationSec: WAN_CLIP_DURATION_MAX_SEC,
    model: WAN_MODEL_METADATA_ALIAS,
    vendor: "siliconflow",
    siliconflowModelId: WAN_MODEL_ID,
  },
} as const;

/**
 * HTTPS hosts allowed for Wan output download (suffix match per
 * validateProviderOutputUrl). Distinct from Replicate/HeyGen.
 * SiliconFlow MaaS delivers via Aliyun OSS under these known hosts —
 * extend only via CONTRACT revision + security review after live fixture.
 */
export const WAN_ALLOWED_OUTPUT_HOSTS: readonly string[] = [
  "sc-maas.oss-cn-shanghai.aliyuncs.com",
  "sc-maas.oss-cn-beijing.aliyuncs.com",
  "sf-maas-prod.oss-cn-shanghai.aliyuncs.com",
  "sf-maas-sgp-ap-southeast-1.oss-ap-southeast-1.aliyuncs.com",
];

/** Alias frozen in SECURITY — same array. */
export const SILICONFLOW_WAN_ALLOWED_OUTPUT_HOSTS = WAN_ALLOWED_OUTPUT_HOSTS;

/** fetchAsset download hardening — mirrors SadTalker/MuseTalk/HeyGen. */
export const WAN_FETCH_TIMEOUT_MS = 120_000 as const;
export const WAN_FETCH_MAX_BYTES = 104_857_600 as const;
export const WAN_FETCH_MAX_REDIRECTS = 3 as const;

/** Short-lived provider-readable reference still URL TTL (seconds). */
export const WAN_INPUT_URL_TTL_SEC = 300 as const;

/** MIME types accepted for I2V reference stills resolved server-side. */
export const WAN_IMAGE_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const wanImageMimeSchema = z.enum(WAN_IMAGE_MIME_ALLOWLIST);

/**
 * SiliconFlow vendor status → normalized videoJobStatus.
 * Status poll is POST /v1/video/status with `{ requestId }`.
 */
export const WAN_VENDOR_STATUS_MAP = {
  InQueue: "queued",
  InProgress: "processing",
  Succeed: "completed",
  Failed: "failed",
} as const;

export type WanVendorStatus = keyof typeof WAN_VENDOR_STATUS_MAP;

/** Max chars for server-authored I2V prompt (beat + script wrap). */
export const WAN_PROMPT_MAX_CHARS = 2000 as const;

/** Delimiter wrap for untrusted beat text inside server-authored prompt. */
export const WAN_PROMPT_BEAT_OPEN = "<<BEAT>>" as const;
export const WAN_PROMPT_BEAT_CLOSE = "<</BEAT>>" as const;

/** i18n messageKey when no owned reference still exists. */
export const WAN_REFERENCE_STILL_MISSING_MESSAGE_KEY =
  "scripts.broll.failure.referenceStillMissing" as const;

/**
 * Clamp clip duration to Wan hard cap / policy band.
 * Values below min → min; above max → max; missing → default.
 */
export function clampWanClipDurationSec(
  requested: number | undefined | null,
): number {
  if (
    requested === undefined ||
    requested === null ||
    !Number.isFinite(requested)
  ) {
    return WAN_CLIP_DURATION_DEFAULT_SEC;
  }
  const rounded = Math.round(requested);
  if (rounded < WAN_CLIP_DURATION_MIN_SEC) {
    return WAN_CLIP_DURATION_MIN_SEC;
  }
  if (rounded > WAN_CLIP_DURATION_MAX_SEC) {
    return WAN_CLIP_DURATION_MAX_SEC;
  }
  return rounded;
}

/** Cap orchestrator clip count. */
export function clampWanClipCount(requested: number): number {
  if (!Number.isFinite(requested) || requested < 1) {
    return 1;
  }
  return Math.min(Math.floor(requested), WAN_MAX_CLIPS_PER_REEL);
}
