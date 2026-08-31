/**
 * Frozen FAL LTX 2.3 Pro / ltx_broll_high contract constants (US-8.8 CONTRACT).
 * FE-safe — no secrets. Adapter reads env via LTX_ENV_KEY_NAME at runtime.
 */
import { z } from "zod";

import { WAN_PROVIDER_KEY } from "@/lib/contracts/siliconflow-wan21-turbo";

/** Error code when FAL_API_KEY is missing before vendor I/O. */
export const PROVIDER_CONFIG_MISSING = "PROVIDER_CONFIG_MISSING" as const;

/** Catalog env_key_name for ltx_broll_high (US-X.4 seed). */
export const LTX_ENV_KEY_NAME = "FAL_API_KEY" as const;

/** Catalog provider key — high-tier B-roll only. */
export const LTX_PROVIDER_KEY = "ltx_broll_high" as const;

/** Adapter videoAssetRole — LTX jobs are never `primary`. */
export const LTX_VIDEO_ASSET_ROLE = "broll" as const;

/** FAL queue control plane — adapter must not accept caller-supplied base URL. */
export const LTX_QUEUE_BASE_URL = "https://queue.fal.run" as const;

/** Full FAL model path segment (catalog metadata alias `ltx-2.3-pro`). */
export const LTX_FAL_MODEL_PATH = "fal-ai/ltx-2.3/image-to-video" as const;

/** Catalog metadata falModelId alias. */
export const LTX_FAL_MODEL_ID = LTX_FAL_MODEL_PATH;

export const LTX_SUBMIT_URL =
  `${LTX_QUEUE_BASE_URL}/${LTX_FAL_MODEL_PATH}` as const;

export const LTX_STATUS_URL_TEMPLATE =
  `${LTX_QUEUE_BASE_URL}/${LTX_FAL_MODEL_PATH}/requests/{requestId}/status` as const;

export const LTX_RESULT_URL_TEMPLATE =
  `${LTX_QUEUE_BASE_URL}/${LTX_FAL_MODEL_PATH}/requests/{requestId}` as const;

/** Vertical Reel framing defaults (frozen in submit body). */
export const LTX_DEFAULT_RESOLUTION = "1080p" as const;
export const LTX_DEFAULT_ASPECT_RATIO = "9:16" as const;
export const LTX_DEFAULT_FPS = 25 as const;

/**
 * Policy band 3–5s (product AC); orchestrator clamp mirrors Wan.
 * FAL vendor enum is 6 | 8 | 10 — see mapLtxVendorDurationSec.
 */
export const LTX_CLIP_DURATION_MIN_SEC = 3 as const;
export const LTX_CLIP_DURATION_MAX_SEC = 5 as const;
export const LTX_CLIP_DURATION_DEFAULT_SEC = 5 as const;

/** FAL I2V duration enum values accepted by vendor API. */
export const LTX_VENDOR_DURATION_VALUES = [6, 8, 10] as const;
export type LtxVendorDurationSec = (typeof LTX_VENDOR_DURATION_VALUES)[number];

export const ltxVendorDurationSchema = z.union([
  z.literal(6),
  z.literal(8),
  z.literal(10),
]);

/** Catalog billingUnit. */
export const LTX_BILLING_UNIT = "per_clip" as const;

/** Seed unitCostCents — ~$1.26/clip. */
export const LTX_UNIT_COST_CENTS_PER_CLIP = 126 as const;

/** Max B-roll clips per Reel (aligns reel-script `brollBeats` max 8). */
export const LTX_MAX_CLIPS_PER_REEL = 8 as const;

/** Frozen catalog cost_model JSON shape (bootstrap parity). */
export const LTX_CATALOG_COST_MODEL = {
  billingUnit: LTX_BILLING_UNIT,
  unitCostCents: LTX_UNIT_COST_CENTS_PER_CLIP,
  metadata: {
    clipDurationSec: LTX_CLIP_DURATION_MAX_SEC,
    model: "ltx-2.3-pro",
    vendor: "fal",
    falModelId: LTX_FAL_MODEL_ID,
  },
} as const;

/**
 * HTTPS hosts allowed for LTX output download (suffix match per
 * validateProviderOutputUrl). Distinct from Wan/SiliconFlow/Replicate/HeyGen.
 */
export const LTX_ALLOWED_OUTPUT_HOSTS: readonly string[] = [
  "fal.media",
  "v3.fal.media",
  "v3b.fal.media",
  "storage.googleapis.com",
];

/** fetchAsset download hardening — mirrors Wan/SadTalker/HeyGen. */
export const LTX_FETCH_TIMEOUT_MS = 120_000 as const;
export const LTX_FETCH_MAX_BYTES = 104_857_600 as const;
export const LTX_FETCH_MAX_REDIRECTS = 3 as const;

/** Short-lived provider-readable reference still URL TTL (seconds). */
export const LTX_INPUT_URL_TTL_SEC = 300 as const;

/** MIME types accepted for I2V reference stills resolved server-side. */
export const LTX_IMAGE_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ltxImageMimeSchema = z.enum(LTX_IMAGE_MIME_ALLOWLIST);

/**
 * FAL queue status → normalized videoJobStatus.
 * Status poll is GET …/requests/{id}/status.
 */
export const LTX_VENDOR_STATUS_MAP = {
  IN_QUEUE: "queued",
  IN_PROGRESS: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELED: "cancelled",
  CANCELLED: "cancelled",
} as const;

export type LtxVendorStatus = keyof typeof LTX_VENDOR_STATUS_MAP;

/** Max chars for server-authored I2V prompt (beat + script wrap). */
export const LTX_PROMPT_MAX_CHARS = 2000 as const;

/** Delimiter wrap for untrusted beat text inside server-authored prompt. */
export const LTX_PROMPT_BEAT_OPEN = "<<BEAT>>" as const;
export const LTX_PROMPT_BEAT_CLOSE = "<</BEAT>>" as const;

/** i18n messageKey when no owned reference still exists (may alias Wan key). */
export const LTX_REFERENCE_STILL_MISSING_MESSAGE_KEY =
  "scripts.broll.failure.referenceStillMissing" as const;

/**
 * Clamp clip duration to policy band 3–5s.
 * Values below min → min; above max → max; missing → default.
 */
export function clampLtxClipDurationSec(
  requested: number | undefined | null,
): number {
  if (
    requested === undefined ||
    requested === null ||
    !Number.isFinite(requested)
  ) {
    return LTX_CLIP_DURATION_DEFAULT_SEC;
  }
  const rounded = Math.round(requested);
  if (rounded < LTX_CLIP_DURATION_MIN_SEC) {
    return LTX_CLIP_DURATION_MIN_SEC;
  }
  if (rounded > LTX_CLIP_DURATION_MAX_SEC) {
    return LTX_CLIP_DURATION_MAX_SEC;
  }
  return rounded;
}

/** Cap orchestrator clip count. */
export function clampLtxClipCount(requested: number): number {
  if (!Number.isFinite(requested) || requested < 1) {
    return 1;
  }
  return Math.min(Math.floor(requested), LTX_MAX_CLIPS_PER_REEL);
}

/**
 * Map policy-clamped seconds to FAL vendor duration enum.
 * ≤5 → 6 (vendor minimum); 6 → 6; >6 → 8 (never 10 in V1 B-roll).
 */
export function mapLtxVendorDurationSec(
  policyClampedSec: number,
): LtxVendorDurationSec {
  const clamped = clampLtxClipDurationSec(policyClampedSec);
  if (clamped <= 5) {
    return 6;
  }
  if (clamped <= 6) {
    return 6;
  }
  return 8;
}

export function buildLtxStatusUrl(requestId: string): string {
  return LTX_STATUS_URL_TEMPLATE.replace("{requestId}", requestId);
}

export function buildLtxResultUrl(requestId: string): string {
  return LTX_RESULT_URL_TEMPLATE.replace("{requestId}", requestId);
}

/** Server-authored LTX B-roll prompt wrapper (Phase B orchestrator). */
export function buildLtxBrollPrompt(params: { beatText: string }): string {
  const beat = params.beatText.trim();
  const wrapped = `${LTX_PROMPT_BEAT_OPEN}${beat}${LTX_PROMPT_BEAT_CLOSE}`;
  const prompt = `High-polish cinematic B-roll. ${wrapped}`;
  if (prompt.length <= LTX_PROMPT_MAX_CHARS) {
    return prompt;
  }
  return prompt.slice(0, LTX_PROMPT_MAX_CHARS);
}

/**
 * Frozen B-roll provider tier pairing (Phase B orchestrator unlock).
 * Exported here for shared contract tests; orchestrator imports in Phase B.
 */
export function isAllowedBrollProviderPair(
  providerKey: string,
  providerTier: "low" | "high",
): boolean {
  return (
    (providerKey === WAN_PROVIDER_KEY && providerTier === "low") ||
    (providerKey === LTX_PROVIDER_KEY && providerTier === "high")
  );
}
