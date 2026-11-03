/**
 * Vercel AI Gateway video adapters — catalog / FE-safe constants.
 * Adapters read AI_GATEWAY_API_KEY at runtime. No secrets here.
 */

/** Shared env key for all AI Gateway rows (LLM + video). */
export const AI_GATEWAY_ENV_KEY_NAME = "AI_GATEWAY_API_KEY" as const;

export const PROVIDER_CONFIG_MISSING = "PROVIDER_CONFIG_MISSING" as const;

/** High-tier talking presenter via Gateway HeyGen Video 1. */
export const AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY =
  "ai_gateway_heygen_avatar" as const;

/** Low-tier B-roll via Gateway Seedance (with model fallbacks). */
export const AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY =
  "ai_gateway_seedance_broll" as const;

export const AI_GATEWAY_HEYGEN_VIDEO_MODEL = "heygen/heygen-video-1" as const;

export const AI_GATEWAY_SEEDANCE_BROLL_MODEL =
  "bytedance/seedance-v1.0-pro-fast" as const;

/** Ordered fallbacks after the primary Seedance model (gateway `models`). */
export const AI_GATEWAY_SEEDANCE_BROLL_FALLBACK_MODELS = [
  "spacexai/grok-imagine-video-1.5-lite",
  "google/veo-3.1-lite-generate-001",
] as const;

/** Default output size class for Gateway video (480p). */
export const AI_GATEWAY_VIDEO_DEFAULT_RESOLUTION_CLASS = "480p" as const;

/** Vertical Reel framing. */
export const AI_GATEWAY_VIDEO_DEFAULT_ASPECT_RATIO = "9:16" as const;

/**
 * Pixel size for Seedance / models that want `{width}x{height}` at 480p 9:16.
 * Matches HeyGen 480p 9:16 table (480x832).
 */
export const AI_GATEWAY_VIDEO_480P_9_16 = "480x832" as const;

export const AI_GATEWAY_HEYGEN_DURATION_MIN_SEC = 5 as const;
export const AI_GATEWAY_HEYGEN_DURATION_MAX_SEC = 15 as const;
export const AI_GATEWAY_HEYGEN_DURATION_DEFAULT_SEC = 5 as const;

export const AI_GATEWAY_SEEDANCE_DURATION_MIN_SEC = 2 as const;
export const AI_GATEWAY_SEEDANCE_DURATION_MAX_SEC = 12 as const;
export const AI_GATEWAY_SEEDANCE_DURATION_DEFAULT_SEC = 5 as const;

/**
 * Gateway HeyGen image-to-video @ 480p ≈ $0.01/s → 1¢/s catalog unit.
 * Cheaper than direct heygen_high (2¢/s) so rank/policy prefers Gateway.
 */
export const AI_GATEWAY_HEYGEN_UNIT_COST_CENTS_PER_SECOND = 1 as const;

/**
 * Seedance v1.0 Pro Fast @ 480p ≈ $0.0097/s × 5s ≈ 5¢/clip.
 * Cheaper than Wan (21¢) so it wins low-tier B-roll ranking.
 */
export const AI_GATEWAY_SEEDANCE_UNIT_COST_CENTS_PER_CLIP = 5 as const;

export const AI_GATEWAY_HEYGEN_VIDEO_ASSET_ROLE = "primary" as const;
export const AI_GATEWAY_SEEDANCE_VIDEO_ASSET_ROLE = "broll" as const;

export const AI_GATEWAY_VIDEO_FETCH_MAX_BYTES = 104_857_600 as const;
export const AI_GATEWAY_VIDEO_FETCH_TIMEOUT_MS = 120_000 as const;
export const AI_GATEWAY_VIDEO_FETCH_MAX_REDIRECTS = 3 as const;

export const AI_GATEWAY_HEYGEN_CATALOG_COST_MODEL = {
  billingUnit: "per_second" as const,
  unitCostCents: AI_GATEWAY_HEYGEN_UNIT_COST_CENTS_PER_SECOND,
  metadata: {
    gatewayModel: AI_GATEWAY_HEYGEN_VIDEO_MODEL,
    resolution: AI_GATEWAY_VIDEO_DEFAULT_RESOLUTION_CLASS,
    vendor: "vercel_ai_gateway",
    approxPerMinuteCents: 60,
  },
};

export const AI_GATEWAY_SEEDANCE_CATALOG_COST_MODEL = {
  billingUnit: "per_clip" as const,
  unitCostCents: AI_GATEWAY_SEEDANCE_UNIT_COST_CENTS_PER_CLIP,
  metadata: {
    gatewayModel: AI_GATEWAY_SEEDANCE_BROLL_MODEL,
    gatewayFallbackModels: [...AI_GATEWAY_SEEDANCE_BROLL_FALLBACK_MODELS],
    resolution: AI_GATEWAY_VIDEO_DEFAULT_RESOLUTION_CLASS,
    clipDurationSec: AI_GATEWAY_SEEDANCE_DURATION_DEFAULT_SEC,
    vendor: "vercel_ai_gateway",
  },
};

export function clampAiGatewayHeygenDurationSec(
  requested: number | undefined | null,
): number {
  if (
    requested === undefined ||
    requested === null ||
    !Number.isFinite(requested)
  ) {
    return AI_GATEWAY_HEYGEN_DURATION_DEFAULT_SEC;
  }
  const rounded = Math.round(requested);
  if (rounded < AI_GATEWAY_HEYGEN_DURATION_MIN_SEC) {
    return AI_GATEWAY_HEYGEN_DURATION_MIN_SEC;
  }
  if (rounded > AI_GATEWAY_HEYGEN_DURATION_MAX_SEC) {
    return AI_GATEWAY_HEYGEN_DURATION_MAX_SEC;
  }
  return rounded;
}

export function clampAiGatewaySeedanceDurationSec(
  requested: number | undefined | null,
): number {
  if (
    requested === undefined ||
    requested === null ||
    !Number.isFinite(requested)
  ) {
    return AI_GATEWAY_SEEDANCE_DURATION_DEFAULT_SEC;
  }
  const rounded = Math.round(requested);
  if (rounded < AI_GATEWAY_SEEDANCE_DURATION_MIN_SEC) {
    return AI_GATEWAY_SEEDANCE_DURATION_MIN_SEC;
  }
  if (rounded > AI_GATEWAY_SEEDANCE_DURATION_MAX_SEC) {
    return AI_GATEWAY_SEEDANCE_DURATION_MAX_SEC;
  }
  return rounded;
}

export function isAiGatewayVideoKey(providerKey: string): boolean {
  return (
    providerKey === AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY ||
    providerKey === AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY
  );
}
