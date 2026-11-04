/**
 * Center-crop / scale a portrait to 9:16 (default 720×1280) with a slight
 * top bias so faces stay in frame. Uses sharp (already pinned in the repo).
 */
import sharp from "sharp";

import {
  HEYGEN_PORTRAIT_CROP_HEIGHT,
  HEYGEN_PORTRAIT_CROP_WIDTH,
} from "@/lib/contracts/heygen-high";

export type CropPortraitTo9x16Params = {
  input: Buffer;
  width?: number;
  height?: number;
  /** 0 = top, 0.5 = center, 1 = bottom. Default 0.35 (top-biased). */
  verticalBias?: number;
};

export type CropPortraitTo9x16Result = {
  buffer: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};

export async function cropPortraitTo9x16(
  params: CropPortraitTo9x16Params,
): Promise<CropPortraitTo9x16Result> {
  const width = params.width ?? HEYGEN_PORTRAIT_CROP_WIDTH;
  const height = params.height ?? HEYGEN_PORTRAIT_CROP_HEIGHT;
  const verticalBias =
    typeof params.verticalBias === "number" && Number.isFinite(params.verticalBias)
      ? Math.min(1, Math.max(0, params.verticalBias))
      : 0.35;

  const image = sharp(params.input, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const srcW = meta.width ?? width;
  const srcH = meta.height ?? height;

  const targetRatio = width / height;
  const srcRatio = srcW / srcH;

  let extractWidth = srcW;
  let extractHeight = srcH;
  let left = 0;
  let top = 0;

  if (srcRatio > targetRatio) {
    // Too wide — crop sides, keep full height.
    extractWidth = Math.max(1, Math.round(srcH * targetRatio));
    left = Math.max(0, Math.round((srcW - extractWidth) / 2));
  } else if (srcRatio < targetRatio) {
    // Too tall — crop vertically with top bias.
    extractHeight = Math.max(1, Math.round(srcW / targetRatio));
    const maxTop = Math.max(0, srcH - extractHeight);
    top = Math.max(0, Math.min(maxTop, Math.round(maxTop * verticalBias)));
  }

  const buffer = await image
    .extract({
      left,
      top,
      width: extractWidth,
      height: extractHeight,
    })
    .resize(width, height, { fit: "fill" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return {
    buffer,
    mimeType: "image/jpeg",
    width,
    height,
  };
}
