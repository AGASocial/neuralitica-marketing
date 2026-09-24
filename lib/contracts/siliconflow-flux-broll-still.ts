/**
 * SiliconFlow FLUX B-roll keyframe (T2I) contract — faceless stills before Wan/LTX I2V.
 * FE-safe — no secrets. Shares SILICONFLOW_API_KEY with Wan/TTS.
 */
import { z } from "zod";

export const FLUX_BROLL_ENV_KEY_NAME = "SILICONFLOW_API_KEY" as const;

/** Fast, cheap T2I for per-beat keyframes. */
export const FLUX_BROLL_MODEL_ID = "black-forest-labs/FLUX.1-schnell" as const;

export const FLUX_BROLL_IMAGES_PATH = "/v1/images/generations" as const;

/** Vertical 9:16 to match Wan/LTX Reel frame. */
export const FLUX_BROLL_IMAGE_SIZE = "720x1280" as const;

/** Conservative estimate — schnell is sub-cent; keep budget math simple. */
export const FLUX_BROLL_STILL_UNIT_COST_CENTS = 1 as const;

export const FLUX_BROLL_PROMPT_MAX_CHARS = 1800 as const;

export const FLUX_BROLL_BEAT_OPEN = "<<BEAT>>" as const;
export const FLUX_BROLL_BEAT_CLOSE = "<</BEAT>>" as const;

export const FLUX_BROLL_NEGATIVE_PROMPT =
  "people, person, human, face, faces, portrait, selfie, hands, logo, watermark, text, subtitles, captions, blurry, low quality, cartoon, anime" as const;

/** Output hosts for FLUX image download (suffix match). */
export const FLUX_BROLL_ALLOWED_OUTPUT_HOSTS: readonly string[] = [
  "sc-maas.oss-cn-shanghai.aliyuncs.com",
  "sc-maas.oss-cn-beijing.aliyuncs.com",
  "sf-maas-prod.oss-cn-shanghai.aliyuncs.com",
  "sf-maas-sgp-ap-southeast-1.oss-ap-southeast-1.aliyuncs.com",
  "s3.6scloud.com",
  "6scloud.com",
  "siliconflow.com",
  "api.siliconflow.com",
];

export const FLUX_BROLL_FETCH_TIMEOUT_MS = 60_000 as const;
export const FLUX_BROLL_FETCH_MAX_BYTES = 15_728_640 as const; // 15 MiB
export const FLUX_BROLL_FETCH_MAX_REDIRECTS = 3 as const;

export const fluxBrollAxisSchema = z.enum(["stock", "product_led", "mixed"]);
export type FluxBrollAxis = z.infer<typeof fluxBrollAxisSchema>;

const AXIS_LOOK: Record<FluxBrollAxis, string> = {
  stock:
    "editorial stock lifestyle photography, cohesive cinematic grade, warm natural light",
  product_led:
    "product-led commercial photography, hero object in real environment, polished grade",
  mixed:
    "mixed lifestyle and product commercial B-roll, one cohesive look and feel",
};

/** Shared aesthetic lock for all stills in one Reel generate batch. */
export function buildBrollStyleLock(params: {
  brollAxis: FluxBrollAxis;
}): string {
  return [
    "Faceless Instagram Reel keyframe still, vertical 9:16 composition.",
    "Same series look: consistent color grade, lens character, contrast, and texture.",
    AXIS_LOOK[params.brollAxis],
    "Cinematic shallow depth of field, rich detail, photoreal.",
    "No people, no faces, no logos, no on-screen text, no watermarks.",
  ].join(" ");
}

export function buildBrollKeyframePrompt(params: {
  beatText: string;
  brollAxis: FluxBrollAxis;
}): string {
  const beat = params.beatText.trim().slice(0, 280);
  const wrapped = [
    buildBrollStyleLock({ brollAxis: params.brollAxis }),
    `Scene: ${FLUX_BROLL_BEAT_OPEN}${beat}${FLUX_BROLL_BEAT_CLOSE}`,
  ].join(" ");
  return wrapped.slice(0, FLUX_BROLL_PROMPT_MAX_CHARS);
}

/** Stable random-ish seed band for SiliconFlow (0..9999999999). */
export function createBrollStyleSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}
